import json
import queue
import threading
import uuid
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponseRedirect, StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Conversation, OAuthAccount, User
from .oauth import oauth
from .serializers import ChatSerializer, FollowUpSerializer, QuestionsSerializer, SignupSerializer, UserSerializer
from agents import state


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.create_user(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        return Response(_tokens_for(user))


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


def resolve_oauth_user(provider: str, provider_account_id: str, email: str) -> User:
    link = OAuthAccount.objects.filter(provider=provider, provider_account_id=provider_account_id).first()
    if link:
        return link.user
    user = User.objects.filter(email__iexact=email).first()
    if not user:
        user = User.objects.create_user(email=email, password=None)

    OAuthAccount.objects.create(user=user, provider=provider, provider_account_id=provider_account_id)
    return user


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_login(request, provider):
    client = oauth.create_client(provider)
    if not client:
        return Response({"detail": "Unknown provider"}, status=404)
    redirect_uri = request.build_absolute_uri(f"/auth/oauth/{provider}/callback/")
    return client.authorize_redirect(request, redirect_uri)


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_callback(request, provider):
    def redirect_with_error(message):
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/?oauth_error={message}")

    client = oauth.create_client(provider)
    if not client:
        return redirect_with_error("unknown_provider")

    token = client.authorize_access_token(request)

    if provider == "google":
        userinfo = token.get("userinfo") or client.userinfo(token=token)
        provider_account_id, email = userinfo["sub"], userinfo["email"]
    elif provider == "github":
        profile = client.get("user", token=token).json()
        provider_account_id = str(profile["id"])
        email = profile.get("email")
        if not email:
            emails = client.get("user/emails", token=token).json()
            primary = next((e for e in emails if e.get("primary")), emails[0] if emails else None)
            email = primary["email"] if primary else None
    else:
        return redirect_with_error("unsupported_provider")

    if not email:
        return redirect_with_error("no_email_from_provider")

    user = resolve_oauth_user(provider, provider_account_id, email)
    tokens = _tokens_for(user)

    query = urlencode({"access": tokens["access"], "refresh": tokens["refresh"]})
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/?{query}")


def _sse_stream(worker_fn):

    q: queue.Queue = queue.Queue()

    def emit(event_type, data):
        q.put((event_type, data))

    def worker():
        try:
            worker_fn(emit)
        except Exception as e:
            emit("error", {"error": str(e)})
        finally:
            q.put(None)

    def generate():
        yield f"event: status\ndata: {json.dumps({'type': 'started', 'message': 'Starting agent...'})}\n\n"
        threading.Thread(target=worker, daemon=True).start()
        while True:
            item = q.get()
            if item is None:
                break
            event_type, data = item
            yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    response = StreamingHttpResponse(generate(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


class ChatView(APIView):
    def post(self, request):
        serializer = ChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        prompt = serializer.validated_data["prompt"]

        conversation_id = str(uuid.uuid4())
        state.create_conversation(conversation_id, prompt, request.user.id)

        def worker(emit):
            from agents.agent import run_agent  
            result = run_agent(prompt, conversation_id=conversation_id, emit=emit)
            if result.get("success"):
                emit("complete", {
                    "message": result.get("message"),
                    "project_id": result.get("project_id"),
                    "project_path": result.get("project_path"),
                    "preview_url": result.get("preview_url"),
                    "conversation_id": conversation_id,
                })

        return _sse_stream(worker)


class ConversationListView(APIView):

    def get(self, request):
        conversations = Conversation.objects.filter(user=request.user).order_by("-created_at")
        data = [
            {
                "id": c.id,
                "original_prompt": c.original_prompt,
                "status": c.status,
                "project_id": c.project_id,
                "created_at": c.created_at.isoformat(),
            }
            for c in conversations
        ]
        return Response(data)


class ConversationDetailView(APIView):

    def get(self, request, conversation_id):
        conversation = state.get_conversation(conversation_id)
        if not conversation:
            return Response({"detail": "Conversation not found"}, status=404)
        if conversation["user_id"] != str(request.user.id):
            return Response({"detail": "Not your conversation"}, status=403)
        return Response(conversation)


class ConversationFilesView(APIView):

    SKIP_DIR_NAMES = {"node_modules", ".git", "dist", "build", ".vite"}
    MAX_FILE_BYTES = 200_000  

    def get(self, request, conversation_id):
        conversation = state.get_conversation(conversation_id)
        if not conversation:
            return Response({"detail": "Conversation not found"}, status=404)
        if conversation["user_id"] != str(request.user.id):
            return Response({"detail": "Not your conversation"}, status=403)

        project_id = conversation.get("project_id")
        if not project_id:
            return Response({"detail": "This conversation doesn't have a built project yet"}, status=400)

        from agents.project_manager import project_manager

        try:
            project_path = project_manager.get_project_path(project_id)
        except FileNotFoundError:
            return Response({"detail": "Project files not found"}, status=404)

        files = []
        for path in sorted(project_path.rglob("*")):
            if not path.is_file():
                continue
            rel_parts = path.relative_to(project_path).parts
            if any(part in self.SKIP_DIR_NAMES for part in rel_parts):
                continue
            try:
                if path.stat().st_size > self.MAX_FILE_BYTES:
                    continue
                content = path.read_text(errors="replace")
            except OSError:
                continue

            files.append({"path": "/".join(rel_parts), "content": content})

        return Response({"files": files})


class QuestionsView(APIView):
    def post(self, request):
        serializer = QuestionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation_id = serializer.validated_data["conversation_id"]
        answers = serializer.validated_data["answers"]

        conversation = state.get_conversation(conversation_id)
        if not conversation:
            return Response({"detail": "Conversation not found"}, status=404)
        if conversation["user_id"] != str(request.user.id):
            return Response({"detail": "Not your conversation"}, status=403)

        state.update_answers(conversation_id, answers)

        def worker(emit):
            from agents.agent import run_agent
            original_prompt = conversation.get("original_prompt", "")
            answers_text = "\n".join(f"- {q}: {a}" for q, a in answers.items())
            enhanced_prompt = f"{original_prompt}\n\nAdditional details:\n{answers_text}"

            result = run_agent(enhanced_prompt, conversation_id=conversation_id, emit=emit)
            if result.get("success"):
                emit("complete", {
                    "message": result.get("message"),
                    "project_id": result.get("project_id"),
                    "project_path": result.get("project_path"),
                    "preview_url": result.get("preview_url"),
                    "conversation_id": conversation_id,
                })

        return _sse_stream(worker)


class FollowUpView(APIView):

    def post(self, request):
        serializer = FollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation_id = serializer.validated_data["conversation_id"]
        message = serializer.validated_data["message"]

        conversation = state.get_conversation(conversation_id)
        if not conversation:
            return Response({"detail": "Conversation not found"}, status=404)
        if conversation["user_id"] != str(request.user.id):
            return Response({"detail": "Not your conversation"}, status=403)
        project_id = conversation.get("project_id")
        if not project_id:
            return Response({"detail": "This conversation doesn't have a built project yet"}, status=400)

        def worker(emit):
            from agents.agent import run_followup
            result = run_followup(message, conversation_id, project_id, emit)
            if result.get("success"):
                emit("complete", {
                    "message": result.get("message"),
                    "project_id": result.get("project_id"),
                    "project_path": result.get("project_path"),
                    "preview_url": result.get("preview_url"),
                    "conversation_id": conversation_id,
                })

        return _sse_stream(worker)