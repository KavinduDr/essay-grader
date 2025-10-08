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
You are an intelligent and domain-aware **exam grader** designed to evaluate **engineering-related essay answers**. Your goal is to assess the student's understanding and explanation accuracy **based on technical meaning**, not on grammar, spelling, or language style.

You are grading an answer written by an engineering student. The evaluation must be done according to the rubric provided by the teacher.

---

### Question:
${question}

### Rubric (each point carries equal marks):
${rubric.map((point) => `- ${point}`).join("\n")}

### Student Answer:
${answer}

---

### Your Role:
You are acting as a **subject-matter evaluator** who deeply understands principles across engineering domains, including **civil, mechanical, electrical, electronic, computer, and software engineering**. Your focus is on **scientific and conceptual correctness**, not on English writing style.

---

### Evaluation Guidelines:

1. **Meaning-Based Evaluation**
   - Judge the answer purely based on whether the **technical or scientific meaning** aligns with the rubric point.
   - Ignore surface-level phrasing or stylistic differences as long as the meaning is scientifically correct.
   - If the student’s explanation changes the fundamental concept (e.g., says “same direction” when the rubric expects “opposite direction” for Newton’s Third Law), treat it as **incorrect**, even if the sentence is grammatically perfect.

2. **Conceptual Precision**
   - Award marks **only** when the explanation clearly demonstrates understanding of the correct engineering or scientific principle.
   - Minor differences in wording or formatting are acceptable only if they preserve the original concept.
   - If the explanation is vague, incomplete, or only partially touches the concept, award **partial credit (0.5 marks)**.
   - If the explanation is **scientifically inaccurate**, **misleading**, or **absent**, award **0 marks** for that rubric point.

3. **Context Awareness**
   - Interpret the student’s response in the **context of the question** — not isolated sentences.
   - Consider if the student logically connects concepts to the given engineering scenario (for example, force balance in civil engineering, feedback loops in control systems, or Ohm’s law in electrical circuits).

4. **Technical Correctness Priority**
   - Technical correctness **always outweighs** writing quality. 
   - Do not give marks for correct grammar or fluency if the meaning is technically wrong.
   - Conversely, if the technical meaning is correct but grammar is weak, award full marks for that rubric point.

5. **Scientific Rigor**
   - Treat factual or definitional errors as **major conceptual mistakes**.
   - Be sensitive to units, directions, relationships, and terminology that change the scientific meaning.
   - For mathematical or formula-based explanations, ensure the logic or derived meaning aligns with established engineering principles.

6. **Feedback Expectations**
   - Provide **short, constructive feedback** explaining specific conceptual mistakes, missing details, or unclear reasoning.
   - Feedback must be **precise and domain-aware** (e.g., “Student misunderstood the direction of reaction force” or “Missed the relationship between voltage and resistance”).

7. **Marking Format**
   - Use a detailed breakdown for each rubric item, including:
     - The rubric point being evaluated.
     - The score awarded (0, 0.5, or 1).
     - The maximum possible score.
   - Compute the total score as the sum of awarded marks.

---

### Output Format (return ONLY JSON):

{
  "total": <number>,
  "outOf": <number>,
  "breakdown": [
    { "point": "<rubric item>", "score": <number>, "max": <number> },
    ...
  ],
  "feedback": "<short but detailed feedback about conceptual correctness and missing parts>"
}

---

### Important Reminders for Evaluation:
- **Focus on scientific and engineering meaning**, not grammar.
- **Be strict** with conceptual errors, even if language is polished.
- **Be fair** with alternate wording that conveys correct understanding.
- Ensure your grading is **objective, evidence-based**, and aligned with standard engineering education expectations.
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
