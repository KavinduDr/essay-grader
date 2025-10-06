import express from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Load OpenAPI spec with proper path resolution
let openApiSpec;
try {
  const specPath = join(__dirname, 'openapi.yaml');
  openApiSpec = yaml.load(fs.readFileSync(specPath, 'utf8'));
} catch (error) {
  console.warn('Could not load OpenAPI spec:', error.message);
  openApiSpec = {
    openapi: '3.1.0',
    info: { title: 'Essay Grader API', version: '1.0.0' },
    paths: {}
  };
}

// Swagger setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Middleware
app.use(express.json());

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

if (genAI) {
    console.log("Gemini initialized");
}

// Helper function to call Gemini
async function gradeEssay(question, rubric, answer) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
You are an exam grader. Grade the student's essay according to the teacher's rubric.

Question: ${question}

Rubric (each worth equal marks):
${rubric.map((point) => `- ${point}`).join("\n")}

Student Answer:
${answer}

Instructions:
- Award marks ONLY if the student's explanation clearly and correctly matches the scientific or engineering principle in the rubric point.
- Minor rewordings are fine, but if the explanation changes the meaning (e.g., says "same reaction" instead of "opposite reaction"), treat it as incorrect or at most partial credit.
- If the explanation is incomplete or vague, give partial credit (0.5). 
- If it is scientifically inaccurate, misleading, or missing, give 0 marks for that rubric point.
- Provide a breakdown of marks for each point.
- Give a total score out of the number of rubric points.
- Write short constructive feedback highlighting precise errors and missing details.
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

    // Remove code block wrappers if present
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Parse failed. Raw output:", text);
        return { error: "Failed to parse AI response", raw: text };
    }
}

// Health check endpoint
app.get("/health", (req, res) => {
    res.send("Server is healthy");
});

app.get("/", (req, res) => {
    res.json({ message: "Essay Grader API", docs: "/api-docs" });
});

// Grade Essay API endpoint
app.post("/grade-essay", async (req, res) => {
    console.log("Incoming body:", req.body);

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

// For Vercel serverless deployment
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Essay grader API running at http://localhost:${port}`);
    });
}

export default app;
