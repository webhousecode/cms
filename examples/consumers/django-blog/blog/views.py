from django.http import Http404, HttpResponseBadRequest
from django.shortcuts import render

import markdown as md_lib

from . import webhouse


_md = md_lib.Markdown(extensions=["fenced_code", "tables"])


def home_en(request):
    posts = webhouse.collection("posts", locale="en")
    return render(request, "blog/home.html", {"posts": posts, "locale": "en"})


def home_da(request):
    posts = webhouse.collection("posts", locale="da")
    return render(request, "blog/home.html", {"posts": posts, "locale": "da"})


def post_detail(request, slug):
    try:
        post = webhouse.document("posts", slug)
    except webhouse.InvalidName:
        return HttpResponseBadRequest("Invalid slug")
    if not post:
        raise Http404("Post not found")

    translation = webhouse.find_translation(post, "posts")
    content_html = _md.reset().convert(webhouse.get_string(post, "content"))

    return render(
        request,
        "blog/post.html",
        {
            "post": post,
            "translation": translation,
            "content_html": content_html,
        },
    )
