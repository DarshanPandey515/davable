import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email


class OAuthAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="oauth_accounts")
    provider = models.CharField(max_length=32)  
    provider_account_id = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_account_id"], name="unique_provider_account")
        ]


class Conversation(models.Model):
    id = models.CharField(primary_key=True, max_length=36)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conversations")
    original_prompt = models.TextField()
    answers = models.JSONField(default=dict)
    status = models.CharField(max_length=32, default="started")
    todos = models.JSONField(default=list)
    project_id = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    preview_url = models.URLField(max_length=500, null=True, blank=True)


class ConversationMessage(models.Model):
    
    class MessageType(models.TextChoices):
        TOOL_CALL = "tool_call", "Tool call"
        TEXT_MESSAGE = "text_message", "Text message"

    class ToolCall(models.TextChoices):
        READ = "read", "Read"
        WRITE = "write", "Write"
        EDIT = "edit", "Edit"
        BASH = "bash", "Bash"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16)
    content = models.TextField()
    message_type = models.CharField(max_length=16, choices=MessageType.choices, default=MessageType.TEXT_MESSAGE)
    tool_call = models.CharField(max_length=16, choices=ToolCall.choices, null=True, blank=True)
    hidden = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]