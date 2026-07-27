from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    path("auth/signup/", views.SignupView.as_view(), name="signup"),
    path("auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("auth/login/refresh/", TokenRefreshView.as_view(), name="login_refresh"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/oauth/<str:provider>/login/", views.oauth_login, name="oauth_login"),
    path("auth/oauth/<str:provider>/callback/", views.oauth_callback, name="oauth_callback"),
    path("chat/", views.ChatView.as_view(), name="chat"),
    path("questions/", views.QuestionsView.as_view(), name="questions"),
    path("followup/", views.FollowUpView.as_view(), name="followup"),
    path("conversations/", views.ConversationListView.as_view(), name="conversation_list"),
    path("conversations/<str:conversation_id>/", views.ConversationDetailView.as_view(), name="conversation_detail"),
    path("conversations/<str:conversation_id>/files/", views.ConversationFilesView.as_view()),
]

