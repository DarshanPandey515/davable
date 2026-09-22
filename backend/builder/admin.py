from django.contrib import admin

from .models import Conversation, ConversationMessage, OAuthAccount, User

admin.site.register(User)
admin.site.register(OAuthAccount)
admin.site.register(Conversation)
admin.site.register(ConversationMessage)
