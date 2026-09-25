import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
from google import genai
from google.genai import types

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-this-development-secret")

SUBJECTS = {"Python", "Java", "C", "HTML", "CSS", "SQL", "Node.js"}
LEVELS = {"Basic", "Intermediate", "Expert"}
LETTERS = ("A", "B", "C", "D")


def clean_json_response(text: str) -> dict[str, Any]:
    """Parse JSON even if the model wraps it in a markdown code fence."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def validate_questions(payload: dict[str, Any]) -> list[dict[str, Any]]:
    questions = payload.get("questions")
    if not isinstance(questions, list) or len(questions) != 10:
        raise ValueError("Gemini must return exactly 10 questions.")

    validated = []
    for item in questions:
        if not isinstance(item, dict):
            raise ValueError("Each question must be an object.")
        question = item.get("question")
        options = item.get("options")
        correct_answer = item.get("correct_answer")
        explanation = item.get("explanation", "")
        if (
            not isinstance(question, str)
            or not question.strip()
            or not isinstance(options, dict)
            or set(options) != set(LETTERS)
            or any(not isinstance(options[key], str) or not options[key].strip() for key in LETTERS)
            or correct_answer not in LETTERS
            or not isinstance(explanation, str)
        ):
            raise ValueError("Question format is invalid.")
        validated.append(
            {
                "question": question.strip(),
                "options": {key: options[key].strip() for key in LETTERS},
                "correct_answer": correct_answer,
                "explanation": explanation.strip(),
            }
        )
    return validated


def generate_questions(subject: str, level: str) -> list[dict[str, Any]]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise RuntimeError("GEMINI_API_KEY is missing. Add it to your .env file.")

    client = genai.Client(api_key=api_key)
    prompt = f"""
Create a focused technical mock interview for {subject} at {level} difficulty.
Return exactly 10 distinct multiple-choice questions. Each must have exactly four
plausible options labeled A, B, C, and D, one correct answer, and a short explanation.
Do not include markdown or any text outside the JSON object.
"""
    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.7,
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "questions": {
                        "type": "ARRAY",
                        "minItems": 10,
                        "maxItems": 10,
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "question": {"type": "STRING"},
                                "options": {
                                    "type": "OBJECT",
                                    "properties": {key: {"type": "STRING"} for key in LETTERS},
                                    "required": list(LETTERS),
                                },
                                "correct_answer": {"type": "STRING", "enum": list(LETTERS)},
                                "explanation": {"type": "STRING"},
                            },
                            "required": ["question", "options", "correct_answer", "explanation"],
                        },
                    }
                },
                "required": ["questions"],
            },
        ),
    )
    if not response.text:
        raise ValueError("Gemini returned an empty response.")
    return validate_questions(clean_json_response(response.text))


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/interview")
def interview():
    return render_template("interview.html")


@app.get("/result")
def result():
    return render_template("result.html")


@app.post("/api/start")
def start_interview():
    data = request.get_json(silent=True) or {}
    subject = data.get("subject")
    level = data.get("level")
    if subject not in SUBJECTS or level not in LEVELS:
        return jsonify({"error": "Choose a valid subject and difficulty level."}), 400
    try:
        questions = generate_questions(subject, level)
    except Exception as error:
        app.logger.exception("Question generation failed")
        return jsonify({"error": str(error)}), 502

    session["quiz"] = {"subject": subject, "level": level, "questions": questions}
    return jsonify({
        "subject": subject,
        "level": level,
        "questions": [{"question": item["question"], "options": item["options"]} for item in questions],
    })


@app.post("/api/submit")
def submit_interview():
    quiz = session.get("quiz")
    data = request.get_json(silent=True) or {}
    answers = data.get("answers")
    if not quiz or not isinstance(answers, list) or len(answers) != 10:
        return jsonify({"error": "Your interview session is incomplete."}), 400
    if any(answer not in LETTERS for answer in answers):
        return jsonify({"error": "Every question needs a valid answer."}), 400

    questions = quiz["questions"]
    correct = sum(answer == item["correct_answer"] for answer, item in zip(answers, questions))
    result_data = {
        "subject": quiz["subject"],
        "level": quiz["level"],
        "answers": answers,
        "questions": questions,
        "score": correct,
        "total": len(questions),
        "wrong": len(questions) - correct,
        "percentage": round(correct / len(questions) * 100),
    }
    session["result"] = result_data
    return jsonify(result_data)


@app.get("/api/result")
def get_result():
    result_data = session.get("result")
    if not result_data:
        return jsonify({"error": "No completed interview found."}), 404
    return jsonify(result_data)


if __name__ == "__main__":
    app.run(debug=True)
