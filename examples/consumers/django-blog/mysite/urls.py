from django.conf import settings
from django.conf.urls.static import static
from django.urls import path
from blog import views

urlpatterns = [
    path("", views.home_en, name="home_en"),
    path("da/", views.home_da, name="home_da"),
    path("blog/<slug:slug>/", views.post_detail, name="post_detail"),
]

# Serve uploaded media + static at /uploads/* and /static/*
urlpatterns += static("/uploads/", document_root=settings.BASE_DIR / "public" / "uploads")
urlpatterns += static(settings.STATIC_URL, document_root=settings.BASE_DIR / "public")
