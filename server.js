import express from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

if (genAI) {
    console.log("Gemini initialized");
}

// Helper function to call Gemini
async function gradeEssay(question, rubric, answer) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an exam grader. Grade the student's essay according to the teacher's rubric.

Question: ${question}

Rubric (each worth equal marks):
${rubric.map((point) => `- ${point}`).join("\n")}

Student Answer:
${answer}

Instructions:
- Award marks for each rubric point that is clearly addressed.
- If partially addressed, award half marks.
- Provide a breakdown of marks for each point.
- Give a total score.
- Write short constructive feedback for the student.
- Return ONLY JSON in the format:
{
  "total": <number>,
  "outOf": <number>,
  "breakdown": [{ "point": "<rubric item>", "score": <number>, "max": <number> }],
  "feedback": "<text>"
}
`;

    const result = await model.generateContent(prompt);
    let text = result.response.text();

    // ✅ Remove code block wrappers if present
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Parse failed. Raw output:", text);
        return { error: "Failed to parse AI response", raw: text };
    }
}

// API endpoint
app.post("/grade-essay", async (req, res) => {
    console.log("Incoming body:", req.body); // 👀 debug log

    const { question, rubric, answer } = req.body;

    if (!question || !rubric || !answer) {
        return res.status(400).json({ error: "question, rubric, and answer are required" });
    }

    try {
        const grading = await gradeEssay(question, rubric, answer);
        res.json(grading);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Something went wrong while grading" });
    }
});


app.listen(port, () => {
    console.log(`Essay grader API running at http://localhost:${port}`);
});
