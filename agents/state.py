from typing import Optional

from builder.models import Conversation, ConversationMessage


def create_conversation(conversation_id: str, original_prompt: str, user_id) -> str:
    Conversation.objects.create(id=conversation_id, user_id=user_id, original_prompt=original_prompt)
    return conversation_id


def get_conversation(conversation_id: str) -> Optional[dict]:
    convo = Conversation.objects.filter(id=conversation_id).first()
    return _serialize(convo) if convo else None


def update_answers(conversation_id: str, answers: dict):
    convo = Conversation.objects.filter(id=conversation_id).first()
    if not convo:
        return None
    merged = dict(convo.answers or {})
    merged.update(answers)
    convo.answers = merged
    convo.status = "clarified"
    convo.save()
    return _serialize(convo)


def update_conversation_status(conversation_id: str, status: str, data: dict = None):
    convo = Conversation.objects.filter(id=conversation_id).first()
    if not convo:
        return None
    convo.status = status
    if data and "project_id" in data:
        convo.project_id = data["project_id"]
    convo.save()
    return _serialize(convo)


def update_todos(conversation_id: str, todos: list):
    convo = Conversation.objects.filter(id=conversation_id).first()
    if not convo:
        return None
    convo.todos = todos
    convo.save()
    return _serialize(convo)


def update_preview_url(conversation_id: str, preview_url: Optional[str]):
    convo = Conversation.objects.filter(id=conversation_id).first()
    if not convo:
        return None
    convo.preview_url = preview_url
    convo.save()
    return _serialize(convo)


def add_conversation_message(
    conversation_id: str,
    role: str,
    content: str,
    message_type: str = ConversationMessage.MessageType.TEXT_MESSAGE,
    tool_call: str = None,
    hidden: bool = False,
):
    convo = Conversation.objects.filter(id=conversation_id).first()
    if not convo:
        return None
    ConversationMessage.objects.create(
        conversation_id=conversation_id,
        role=role,
        content=content,
        message_type=message_type,
        tool_call=tool_call,
        hidden=hidden,
    )
    return get_conversation(conversation_id)


def get_conversation_messages(conversation_id: str):
    convo = get_conversation(conversation_id)
    return convo.get("messages", []) if convo else []


def _serialize(convo: Conversation) -> dict:
    return {
        "id": convo.id,
        "user_id": str(convo.user_id),
        "original_prompt": convo.original_prompt,
        "answers": convo.answers or {},
        "status": convo.status,
        "created_at": convo.created_at.isoformat(),
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "message_type": m.message_type,
                "tool_call": m.tool_call,
                "hidden": m.hidden,
                "timestamp": m.timestamp.isoformat(),
            }
            for m in convo.messages.all()
        ],
        "todos": convo.todos or [],
        "project_id": convo.project_id,
        "preview_url": convo.preview_url,
    }