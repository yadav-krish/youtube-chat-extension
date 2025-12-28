from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
)

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda

from dotenv import load_dotenv
from pathlib import Path
import google.generativeai as genai

import os
import re
import logging

# -------------------- setup --------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY missing in .env")

genai.configure(api_key=GOOGLE_API_KEY)

app = FastAPI(title="YouTube Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- models --------------------

class Query(BaseModel):
    video_id: str
    question: str


class HealthResponse(BaseModel):
    status: str
    message: str


# -------------------- helpers --------------------

def extract_video_id(url_or_id: str) -> str:
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([^&\n?#]+)",
        r"^([a-zA-Z0-9_-]{11})$",
    ]

    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)

    raise ValueError(f"Invalid YouTube URL or ID: {url_or_id}")


def get_video_transcript(video_id: str) -> str:
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)
        text = " ".join(segment.text for segment in transcript)

        if len(text) > 50_000:
            text = text[:50_000] + "..."

        return text

    except TranscriptsDisabled:
        raise HTTPException(status_code=400, detail="Transcripts are disabled")

    except NoTranscriptFound:
        raise HTTPException(status_code=404, detail="No transcript found")

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get transcript: {str(e)}",
        )


# -------------------- Gemini (LangChain-compatible) --------------------

def gemini_flash_llm(inputs: dict) -> str:
    prompt_text = inputs["prompt"]
    model = genai.GenerativeModel("gemini-2.5-flash-lite")
    response = model.generate_content(prompt_text)
    return response.text


gemini_runnable = RunnableLambda(gemini_flash_llm)

# -------------------- routes --------------------

@app.get("/", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        message="YouTube Chatbot API is running",
    )


@app.post("/ask")
async def ask_video_question(query: Query):
    try:
        logger.info(f"Processing video: {query.video_id}")

        video_id = extract_video_id(query.video_id)
        transcript_text = get_video_transcript(video_id)

        prompt_template = ChatPromptTemplate.from_template(
            """
You are an assistant answering questions about a YouTube video.

Rules:
- Use ONLY the transcript below
- If the answer is not present, say "Not mentioned in the video"

Transcript:
{transcript}

Question:
{question}

Answer:
"""
        )

        # IMPORTANT: format prompt to STRING (not messages)
        formatted_prompt = prompt_template.format(
            transcript=transcript_text,
            question=query.question,
        )

        answer = gemini_runnable.invoke(
            {"prompt": formatted_prompt}
        )

        return {
            "video_id": video_id,
            "answer": answer,
            "transcript_length": len(transcript_text),
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}",
        )


@app.get("/test/{video_id}")
async def test_transcript(video_id: str):
    video_id = extract_video_id(video_id)
    transcript_text = get_video_transcript(video_id)

    return {
        "video_id": video_id,
        "transcript_available": True,
        "transcript_length": len(transcript_text),
        "preview": transcript_text[:200] + "..."
        if len(transcript_text) > 200
        else transcript_text,
    }


# -------------------- run --------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
