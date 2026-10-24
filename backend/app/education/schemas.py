from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

Material = Literal["lesson_plan", "sequence", "summary", "slides", "activities", "assessment", "answer_key", "mind_map", "word_search", "adapted", "coloring"]


class Preferences(BaseModel):
    school: str = Field(default="", max_length=160)
    teacher: str = Field(default="", max_length=120)
    subject: str = Field(default="História", max_length=80)
    grade: int = Field(default=7, ge=1, le=12)
    term: str = Field(default="", max_length=80)
    lessons: int = Field(default=3, ge=1, le=10)
    questions: int = Field(default=10, ge=1, le=40)
    activity_type: Literal['mixed','objective','discursive'] = 'mixed'
    slide_style: Literal["clean", "visual", "high_contrast"] = "clean"
    adaptation: str = Field(default="", max_length=1500)
    auto_save: bool = True


class ResearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    provider: Literal["web", "youtube", "both"] = "both"
    grade: int = Field(default=7, ge=1, le=12)
    videos: int = Field(default=3, ge=1, le=8)
    save_to_memory: bool = False
    analyze: bool = False


class LessonRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=300)
    subject: str | None = Field(default=None, max_length=80)
    grade: int | None = Field(default=None, ge=1, le=12)
    lessons: int | None = Field(default=None, ge=1, le=10)
    questions: int | None = Field(default=None, ge=1, le=40)
    activity_type: Literal['mixed','objective','discursive'] | None = None
    materials: list[Material] = Field(default_factory=lambda:["sequence", "summary", "slides", "activities", "answer_key"], min_length=1, max_length=11)
    videos: int = Field(default=3, ge=0, le=8)
    research: bool = True
    research_id: str | None = Field(default=None, max_length=36)
    bncc: bool = False
    adaptation: str | None = Field(default=None, max_length=1500)
    save_to_memory: bool | None = None
    prepare_share: bool = False
    content: str = Field(default="", max_length=40000)

    @field_validator("topic")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Informe o tema.")
        return value.strip()


class Command(BaseModel):
    text: str = Field(min_length=2, max_length=8000)
    temporary: bool = False


class Lesson(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    duration_minutes: int = Field(ge=10, le=240)
    explanation: str = Field(min_length=80, max_length=12000)
    methodology: list[str] = Field(min_length=1, max_length=12)
    resources: list[str] = Field(max_length=12)
    evaluation: str = Field(min_length=10, max_length=2000)


class Activity(BaseModel):
    number: int = Field(ge=1, le=40)
    kind: Literal["objective", "discursive"]
    prompt: str = Field(min_length=10, max_length=2500)
    options: list[Annotated[str,Field(min_length=1,max_length=1000)]] = Field(max_length=4)
    answer: str = Field(min_length=1, max_length=3000)
    explanation: str = Field(min_length=3, max_length=3000)


class Slide(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    bullets: list[Annotated[str,Field(min_length=1,max_length=140)]] = Field(min_length=1, max_length=6)


class Branch(BaseModel):
    label: str = Field(max_length=80)
    items: list[str] = Field(min_length=1, max_length=5)


class LessonPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=200)
    overview: str = Field(min_length=40, max_length=12000)
    objectives: list[str] = Field(min_length=1, max_length=12)
    lessons: list[Lesson] = Field(min_length=1, max_length=10)
    activities: list[Activity] = Field(min_length=1, max_length=40)
    slides: list[Slide] = Field(min_length=1, max_length=25)
    mind_map: list[Branch] = Field(min_length=1, max_length=8)
    word_search: list[str] = Field(min_length=3, max_length=15)
    illustration: Literal["temple", "plant", "solar_system", "concept"]
    illustration_caption: str = Field(min_length=3, max_length=250)
    curriculum: list[str] = Field(max_length=15)


class PedagogicalReview(BaseModel):
    grade_appropriate: bool
    answers_match: bool
    issues: list[Annotated[str,Field(max_length=1500)]] = Field(default_factory=list,max_length=12)


class SharePrepare(BaseModel):
    file_id: str = Field(max_length=36)
    message: str = Field(min_length=1, max_length=4000)
    reviewed: bool


class ShareOutcome(BaseModel):
    state: Literal["initiated", "system_returned", "cancelled", "failed", "downloaded"]
