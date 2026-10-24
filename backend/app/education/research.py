import html
import io
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from PIL import Image
from ..services import web_search


def safe_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password or len(value)>2000:
            return None
        return value
    except ValueError:
        return None


def duration_seconds(value):
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or "")
    return sum(int(v or 0)*factor for v,factor in zip(match.groups(),[3600,60,1])) if match else None


class YouTubeResearchService:
    def __init__(self, settings, transport=None):
        self.settings, self.transport = settings, transport
        self.available = None
        self.thumbnails = {}

    async def request(self, resource, params):
        if not self.settings.youtube_api_key:
            raise HTTPException(503,"YouTube sem credencial. Configure YOUTUBE_API_KEY no backend.")
        try:
            async with httpx.AsyncClient(timeout=25,transport=self.transport,follow_redirects=False) as client:
                response=await client.get("https://www.googleapis.com/youtube/v3/"+resource,
                    params={**params,"key":self.settings.youtube_api_key})
                response.raise_for_status()
                data=response.json()
                if not isinstance(data,dict) or not isinstance(data.get("items"),list):
                    raise ValueError()
                self.available=True
                return data
        except (httpx.HTTPError,ValueError):
            self.available=False
            raise HTTPException(502,"YouTube indisponível. Verifique a chave, a ativação da Data API v3 e a cota.") from None

    async def search(self, query, count=3, grade=7):
        data=await self.request("search",{"part":"snippet","q":query+f" aula educativa em português {grade}º ano", "type":"video",
            "maxResults":min(25,count*3),"relevanceLanguage":"pt","regionCode":"BR","safeSearch":"strict","order":"relevance","videoEmbeddable":"true"})
        ids=[item.get("id",{}).get("videoId","") for item in data["items"]]
        ids=[value for value in dict.fromkeys(ids) if re.fullmatch(r"[A-Za-z0-9_-]{11}",value)]
        if not ids:return []
        details=await self.request("videos",{"part":"snippet,contentDetails,status","id":",".join(ids)})
        items=[]
        for item in details["items"]:
            identifier=item.get("id","")
            if identifier not in ids:continue
            snippet=item.get("snippet",{});status=item.get("status",{});content=item.get("contentDetails",{})
            language=snippet.get("defaultAudioLanguage") or snippet.get("defaultLanguage")
            if not isinstance(language,str) or not language.lower().startswith("pt"):continue
            if status.get("privacyStatus")!="public" or not status.get("embeddable",False):continue
            if grade<12 and content.get("contentRating",{}).get("ytRating")=="ytAgeRestricted":continue
            duration=duration_seconds(content.get("duration"))
            if duration and duration>(1800 if grade<6 else 3600):continue
            title=html.unescape(str(snippet.get("title","")))[:300]
            if not title:continue
            items.append({"id":identifier,"title":title,"channel":html.unescape(str(snippet.get("channelTitle","")))[:200],
                "description":html.unescape(str(snippet.get("description","")))[:4000],"url":"https://www.youtube.com/watch?v="+identifier,
                "thumbnail":"/api/education/youtube/thumbnail/"+identifier,"duration_seconds":duration,
                "published_at":snippet.get("publishedAt"),"language":language,"language_verified":bool(language),
                "review_required":True,"validation":"Metadados conferidos na YouTube Data API; conteúdo e faixa etária exigem revisão docente."})
        return sorted(items,key=lambda item:ids.index(item["id"]))[:count]

    async def thumbnail(self, identifier):
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}",identifier):raise HTTPException(404,"Miniatura não encontrada.")
        if identifier in self.thumbnails:return self.thumbnails[identifier]
        try:
            async with httpx.AsyncClient(timeout=12,transport=self.transport,follow_redirects=False) as client:
                async with client.stream("GET",f"https://i.ytimg.com/vi/{identifier}/mqdefault.jpg") as response:
                    response.raise_for_status();chunks=[];size=0
                    async for chunk in response.aiter_bytes():
                        size+=len(chunk)
                        if size>2_000_000:raise ValueError()
                        chunks.append(chunk)
            raw=b"".join(chunks)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"JPEG","PNG"} or image.width*image.height>4_000_000:raise ValueError()
                image.verify()
            if len(self.thumbnails)>100:self.thumbnails.clear()
            self.thumbnails[identifier]=raw
            return raw
        except (httpx.HTTPError,ValueError,OSError):
            raise HTTPException(502,"Miniatura indisponível.") from None


class WebResearchService:
    def __init__(self,settings):
        self.settings=settings
        self.available=None

    async def search(self,db,query):
        try:
            result=await web_search(self.settings,db,query,persist=False)
            self.available=True
        except HTTPException:
            self.available=False
            raise
        items=[]
        for value in result["results"]:
            url=safe_url(value.get("url"))
            if not url:continue
            host=urlsplit(url).hostname.lower()
            institution=host.endswith((".edu",".edu.br",".gov.br",".gov",".ac.uk",".edu.pt",".usp.br",".ufrj.br",".unicamp.br",".unesp.br")) or host in {'britishmuseum.org','www.britishmuseum.org','museudaimigracao.org.br','www.museudaimigracao.org.br'}
            items.append({**value,"url":url,"origin":host,"institutional_domain":institution,
                "verification":"Trecho e link retornados pela Brave Search; página completa não consultada.","checked_at":datetime.now(timezone.utc).isoformat()})
        return sorted(items,key=lambda item:not item["institutional_domain"])


async def collect(web,youtube,db,query,grade,videos=3,provider="both"):
    sources=[];clips=[];warnings=[]
    if provider in {"both","web"}:
        try:sources=await web.search(db,query)
        except HTTPException as error:warnings.append(error.detail)
    if provider in {"both","youtube"} and videos:
        try:clips=await youtube.search(query,videos,grade)
        except HTTPException as error:warnings.append(error.detail)
        if len(clips)<videos:warnings.append(f"Encontrados {len(clips)} de {videos} vídeos solicitados, após os filtros; não foram inventados resultados.")
    return {"query":query,"grade":grade,"sources":sources,"videos":clips,"warnings":warnings,
            "analysis":None,"checked_at":datetime.now(timezone.utc).isoformat()}
