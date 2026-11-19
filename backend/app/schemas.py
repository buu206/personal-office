from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class CreateTask(Strict):
    title: str = Field(min_length=1, max_length=2000)
    criteria: str = Field(min_length=1, max_length=1500)
    material: str = Field(default='', max_length=12000)
    material_consent: Literal[True]
    idempotency_key: str = Field(min_length=8, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')

    @field_validator('title', 'criteria')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('不能为空')
        return value.strip()

class Mutation(Strict):
    version: int = Field(ge=0)

class Plan(Strict):
    goal: str = Field(min_length=1, max_length=2000)
    outline: list[str] = Field(min_length=1, max_length=12)
    gaps: list[str] = Field(max_length=20)

class Document(Strict):
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1, max_length=16000)
    gaps: list[str] = Field(max_length=20)

    @field_validator('title', 'markdown')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('empty output')
        return value

class Review(Strict):
    approved: bool
    summary: str = Field(min_length=1, max_length=2000)
    issues: list[str] = Field(max_length=30)

class ErrorDetail(Strict):
    code: str
    message: str

class ErrorResponse(Strict):
    error: ErrorDetail

class StepView(Strict):
    stage: str
    sequence: int
    output: dict
    artifact_hash: str | None = None

class TaskView(Strict):
    id: str
    title: str
    criteria: str
    material: str
    status: str
    version: int
    error_code: str | None
    created_at: str
    updated_at: str
    spent_micros: int
    steps: list[StepView]

class TaskList(Strict):
    tasks: list[TaskView]

class Session(Strict):
    csrf_token: str

class Capabilities(Strict):
    configured: bool
    pricing_current: bool
    model: str
    spent_micros: int
    total_budget_micros: int
    task_budget_micros: int
    halted: bool
    supported: list[str]

class Health(Strict):
    status: Literal['ok'] = 'ok'

class OfficeError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)
