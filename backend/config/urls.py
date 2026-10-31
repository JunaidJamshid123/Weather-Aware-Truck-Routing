from django.urls import include, path

urlpatterns = [
    path("api/", include("routing.api.urls")),
]

handler404 = "routing.api.exceptions.not_found_view"
handler500 = "routing.api.exceptions.server_error_view"
