const letters = ["A", "B", "C", "D"];
const getJson = async (url, options = {}) => {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
};

function showError(element, message) { element.textContent = message; }

const setupForm = document.querySelector("#setup-form");
if (setupForm) {
  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = setupForm.querySelector("button");
    const message = document.querySelector("#setup-message");
    button.disabled = true; button.innerHTML = "Generating your interview <span>...</span>"; showError(message, "");
    const subject = setupForm.querySelector("[name=subject]:checked").value;
    const level = setupForm.querySelector("[name=level]:checked").value;
    try {
      const quiz = await getJson("/api/start", { method: "POST", body: JSON.stringify({ subject, level }) });
      sessionStorage.setItem("quiz", JSON.stringify(quiz));
      window.location.href = "/interview";
    } catch (error) {
      showError(message, error.message); button.disabled = false; button.innerHTML = "Start interview <span aria-hidden=\"true\">&#8594;</span>";
    }
  });
}

const interviewApp = document.querySelector("#interview-app");
if (interviewApp) {
  const quiz = JSON.parse(sessionStorage.getItem("quiz") || "null");
  if (!quiz || !quiz.questions?.length) { window.location.href = "/"; }
  else {
    let current = 0; const answers = [];
    document.querySelector("#session-label").textContent = `${quiz.subject} · ${quiz.level}`;
    const render = () => {
      const item = quiz.questions[current]; const selected = answers[current];
      interviewApp.innerHTML = `<div class="interview-meta"><span>Question ${current + 1} / ${quiz.questions.length}</span><span>${Math.round((current / quiz.questions.length) * 100)}% complete</span></div><div class="progress-track"><div class="progress-bar" style="width:${((current + 1) / quiz.questions.length) * 100}%"></div></div><article class="question-card"><p class="eyebrow">${quiz.subject} · ${quiz.level}</p><h1>${item.question}</h1><div class="answer-list">${letters.map((letter) => `<label class="answer-option ${selected === letter ? "selected" : ""}"><input type="radio" name="answer" value="${letter}" ${selected === letter ? "checked" : ""}><span class="option-letter">${letter}</span><span>${item.options[letter]}</span></label>`).join("")}</div><div class="next-row"><button class="button button-primary" id="next-button" type="button" ${selected ? "" : "disabled"}>${current === quiz.questions.length - 1 ? "Finish interview" : "Next question"} <span aria-hidden="true">&#8594;</span></button></div></article>`;
      interviewApp.querySelectorAll(".answer-option").forEach((option) => option.addEventListener("click", () => { answers[current] = option.querySelector("input").value; render(); }));
      interviewApp.querySelector("#next-button").addEventListener("click", async () => { if (current < quiz.questions.length - 1) { current += 1; render(); return; } const button = interviewApp.querySelector("#next-button"); button.disabled = true; button.textContent = "Calculating..."; try { const result = await getJson("/api/submit", { method: "POST", body: JSON.stringify({ answers }) }); sessionStorage.setItem("result", JSON.stringify(result)); window.location.href = "/result"; } catch (error) { button.disabled = false; button.textContent = error.message; } });
    }; render();
  }
}

const resultsApp = document.querySelector("#results-app");
if (resultsApp) {
  const result = JSON.parse(sessionStorage.getItem("result") || "null");
  if (!result) { window.location.href = "/"; }
  else {
    resultsApp.innerHTML = `<div class="result-heading"><p class="eyebrow">Interview complete</p><h1>Nice work. Keep going.</h1><p>${result.subject} · ${result.level} challenge</p></div><section class="score-panel"><div class="score-number">${result.score}<small> / ${result.total}</small></div><div class="score-copy"><strong>Your overall score</strong><span>${result.percentage}% correct answers</span></div></section><div class="stat-grid"><div class="stat"><strong>${result.score}</strong><span>Correct answers</span></div><div class="stat"><strong>${result.wrong}</strong><span>Wrong answers</span></div><div class="stat"><strong>${result.percentage}%</strong><span>Percentage</span></div></div><div class="result-actions"><button class="button button-primary" id="download-pdf">Download result as PDF <span aria-hidden="true">&#8595;</span></button><button class="button button-secondary" id="try-again">Try again</button><a class="button button-secondary" href="/">Back to home</a></div><section class="review-list"><h2>Question review</h2>${result.questions.map((item, index) => { const isCorrect = result.answers[index] === item.correct_answer; return `<article class="review-item ${isCorrect ? "correct" : "wrong"}"><p class="review-question">${index + 1}. ${item.question}</p><p class="review-detail">Your answer: <strong>${result.answers[index]}. ${item.options[result.answers[index]]}</strong> · Correct answer: <strong>${item.correct_answer}. ${item.options[item.correct_answer]}</strong><br>${item.explanation}</p></article>`; }).join("")}</section>`;
    document.querySelector("#try-again").addEventListener("click", () => { window.location.href = "/"; });
    document.querySelector("#download-pdf").addEventListener("click", () => downloadPdf(result));
  }
}

function downloadPdf(result) {
  const { jsPDF } = window.jspdf; const pdf = new jsPDF(); let y = 18;
  const addWrapped = (text, x, width, size = 10, gap = 6) => { pdf.setFontSize(size); const lines = pdf.splitTextToSize(text, width); if (y + lines.length * gap > 280) { pdf.addPage(); y = 18; } pdf.text(lines, x, y); y += lines.length * gap; };
  pdf.setTextColor(12, 118, 109); pdf.setFontSize(20); pdf.text("AI Mock Interview", 15, y); y += 10; pdf.setTextColor(22, 33, 42); addWrapped(`Subject: ${result.subject}    Difficulty: ${result.level}`, 15, 180); addWrapped(`Score: ${result.score} / ${result.total}    Correct: ${result.score}    Wrong: ${result.wrong}    Percentage: ${result.percentage}%`, 15, 180); y += 5; pdf.setTextColor(12, 118, 109); pdf.setFontSize(14); pdf.text("Question Review", 15, y); y += 8; pdf.setTextColor(22, 33, 42);
  result.questions.forEach((item, index) => { const answer = result.answers[index]; addWrapped(`${index + 1}. ${item.question}`, 15, 180, 10, 5); addWrapped(`Your answer: ${answer}. ${item.options[answer]}`, 20, 175, 9, 5); addWrapped(`Correct answer: ${item.correct_answer}. ${item.options[item.correct_answer]}`, 20, 175, 9, 5); addWrapped(`Explanation: ${item.explanation}`, 20, 175, 9, 5); y += 3; });
  pdf.save("ai-mock-interview-result.pdf");
}
