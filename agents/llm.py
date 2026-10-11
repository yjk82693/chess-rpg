"""Luminal OpenAI-compatible JSON calls with validation (PLAN §7.1)."""

from __future__ import annotations

import json
import os
import re
from typing import TypeVar

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, ValidationError

load_dotenv()

T = TypeVar("T", bound=BaseModel)


def _client() -> OpenAI:
    base = os.environ.get("LUMINAL_BASE_URL")
    key = os.environ.get("LUMINAL_API_KEY")
    if not base or not key:
        raise RuntimeError("Set LUMINAL_BASE_URL and LUMINAL_API_KEY in .env")
    return OpenAI(base_url=base, api_key=key)


def _extract_json(text: str) -> str:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        return fence.group(1).strip()
    return text


def call_json_model(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float,
    schema: type[T],
) -> T:
    client = _client()
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "{}"
    data = json.loads(_extract_json(raw))
    return schema.model_validate(data)


def call_with_retry_and_fallback(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float,
    schema: type[T],
    fallback: T,
    error_context: str = "",
) -> T:
    """Validate JSON; retry once with error message; else return fallback."""
    last_err = ""
    for attempt in range(2):
        try:
            prompt = user
            if attempt == 1:
                prompt = f"{user}\n\nPrevious validation error:\n{last_err}\nFix and output valid JSON only."
            return call_json_model(
                model=model,
                system=system,
                user=prompt,
                temperature=temperature,
                schema=schema,
            )
        except (ValidationError, json.JSONDecodeError, RuntimeError) as exc:
            last_err = str(exc)
            if attempt == 1:
                break
    # Parent playbook fallback for Coach is handled by caller supplying fallback Playbook/CoachProposal.
    return fallback


def coach_model_name() -> str:
    return os.environ.get("LUMINAL_COACH_MODEL", "deepseek-chat")


def qm_model_name() -> str:
    return os.environ.get("LUMINAL_QM_MODEL", "glm-4-flash")
