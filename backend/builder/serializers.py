from rest_framework import serializers

from .models import User


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already registered")
        return value


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "created_at"]


class ChatSerializer(serializers.Serializer):
    prompt = serializers.CharField()


class QuestionsSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    answers = serializers.DictField()


class FollowUpSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    message = serializers.CharField()