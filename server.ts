import express from 'express';
import { createServer as createViteServer } from 'vite';
import { config } from 'dotenv';
import path from 'path';
import asyncHandler from 'express-async-handler';
import { GoogleGenAI } from '@google/genai';
import { GithubRepoLoader } from '@langchain/community/document_loaders/web/github';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import crypto from 'crypto';
import parseGithubUrl from 'parse-github-url';

config();
// The user has put their explicit keys into .env.example, so load them from there
config({ path: '.env.example', override: true });

// In-memory Database
type Repo = {
  id: string;
  githubUrl: string;
  owner: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: number;
};

type Chunk = {
  id: string;
  repoId: string;
  filePath: string;
  lineStart: number;
  content: string;
  embedding: number[];
};

const db = {
  repos: new Map<string, Repo>(),
  chunks: [] as Chunk[],
};

// Setup Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MOCK_EMBEDDINGS = process.env.MOCK_EMBEDDINGS === 'true';

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (MOCK_EMBEDDINGS) {
    return texts.map(() => Array(768).fill(0).map(() => Math.random()));
  }

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 5) {
    const batch = texts.slice(i, i + 5);
    const promises = batch.map(async text => {
      try {
        const result = await ai.models.embedContent({
          model: 'gemini-embedding-2-preview',
          contents: text,
        });
        return result.embeddings?.[0]?.values || Array(768).fill(0);
      } catch (e) {
        console.error("Embedding error:", e);
        return Array(768).fill(0); // Fallback
      }
    });
    
    results.push(...(await Promise.all(promises)));
    
    if (i + 5 < texts.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // INGEST ROUTE
  app.post('/api/ingest', asyncHandler(async (req, res) => {
    const { githubUrl } = req.body;
    if (!githubUrl) {
      res.status(400).json({ error: 'GitHub URL is required' });
      return;
    }

    const parsed = parseGithubUrl(githubUrl);
    if (!parsed || !parsed.owner || !parsed.name) {
      res.status(400).json({ error: 'Invalid GitHub URL' });
      return;
    }

    const repoId = `${parsed.owner}/${parsed.name}`;
    
    // Check cache
    if (db.repos.has(repoId)) {
      res.json({ success: true, repoId });
      return;
    }

    console.log(`Ingesting ${repoId}...`);

    let branch = 'main';
    try {
      const repoInfoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.name}`, {
        headers: process.env.GITHUB_API_KEY ? {
          Authorization: `Bearer ${process.env.GITHUB_API_KEY}`
        } : {}
      });
      if (repoInfoRes.ok) {
        const repoInfo = await repoInfoRes.json();
        branch = repoInfo.default_branch || 'main';
      }
    } catch (e) {
      console.warn("Failed to fetch default branch, falling back to main", e);
    }

    const loader = new GithubRepoLoader(githubUrl, {
      branch: branch,
      recursive: true,
      unknown: 'warn',
      ignoreFiles: ['.gitignore'],
      accessToken: process.env.GITHUB_API_KEY,
    });

    const docs = await loader.load();
    console.log(`Loaded ${docs.length} files`);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const splitDocs = await splitter.splitDocuments(docs);
    console.log(`Split into ${splitDocs.length} chunks`);

    // AI Tagging
    let tags = ["Fullstack", "Web"];
    try {
      const readme = docs.find(d => d.metadata.source.toLowerCase() === 'readme.md')?.pageContent || '';
      const prompt = `
You are a code analyst. Return ONLY JSON: {"tags": ["Tag1", "Tag2", "Tag3"]}
Tags must come from this list: Frontend, Backend, Fullstack, Python, TypeScript, Rust, Go, Web3, Data Science, DevOps, CLI, Mobile, API, ML/AI. No explanation.

Repo data excerpt: ${readme.substring(0, 1500)}
`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         tags = JSON.parse(jsonMatch[0]).tags || tags;
      }
    } catch (e) {
      console.error("Tagging error:", e);
    }

    const repo: Repo = {
      id: repoId,
      githubUrl,
      owner: parsed.owner,
      name: parsed.name,
      description: parsed.name, // Simplified
      tags,
      createdAt: Date.now(),
    };

    db.repos.set(repoId, repo);

    // Limit chunks to prevent out of memory or hitting Gemini API limits heavily in dev
    // Free tier allows 15 RPM so we limit max chunks
    const MAX_CHUNKS = 10;
    const procDocs = splitDocs.slice(0, MAX_CHUNKS);

    const embeddings = await generateEmbeddings(procDocs.map(d => d.pageContent));

    for (let i = 0; i < procDocs.length; i++) {
        db.chunks.push({
            id: crypto.randomUUID(),
            repoId,
            filePath: procDocs[i].metadata.source,
            lineStart: procDocs[i].metadata.loc?.lines?.from || 1,
            content: procDocs[i].pageContent,
            embedding: embeddings[i]
        });
    }

    console.log(`Ingestion complete for ${repoId}`);
    res.json({ success: true, repoId });
  }));

  // SEARCH ROUTE
  app.post('/api/search', asyncHandler(async (req, res) => {
    const { repoId, query } = req.body;
    
    if (!query || !repoId) {
      res.status(400).json({ error: 'Missing parameters' });
      return;
    }

    const [queryEmbedding] = await generateEmbeddings([query]);

    const repoChunks = db.chunks.filter(c => c.repoId === repoId);
    
    const scoredChunks = repoChunks.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scoredChunks.sort((a, b) => b.score - a.score);
    const topResults = scoredChunks.slice(0, 5).map(r => ({
      filePath: r.filePath,
      lineStart: r.lineStart,
      content: r.content,
      score: r.score,
    }));

    const contextStr = topResults.map(r => `File: ${r.filePath}\n${r.content}`).join('\n\n');
    const prompt = `You are an expert developer helping explain a codebase. Use the following code snippets to answer the user's question.\nIf the snippets don't contain the exact answer, try your best to answer based on the general context provided.\nKeep the answer concise and helpful (max 1-2 paragraphs).\n\nCode Snippets:\n${contextStr}\n\nQuestion: ${query}`;
    
    let answer = "Could not generate an AI response based on the search context.";
    try {
        const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: prompt
        });
        answer = response.text || answer;
    } catch (e) {
        console.error("Search explanation error", e);
    }

    res.json({ results: topResults, answer });
  }));

  // DIAGRAM ROUTE
  app.post('/api/diagram', asyncHandler(async (req, res) => {
    const { repoId } = req.body;

    const repoChunks = db.chunks.filter(c => c.repoId === repoId);
    if (repoChunks.length === 0) {
        res.json({ nodes: [], edges: [] });
        return;
    }

    const paths = Array.from(new Set(repoChunks.map(c => c.filePath))).join('\\n');
    const readmeContent = repoChunks.find(c => c.filePath.toLowerCase().includes('readme.md'))?.content || '';

    try {
        const prompt = `
You are a software architect. Return ONLY JSON:
{ "nodes": [{ "id": "1", "label": "Label", "layer": "frontend" }], "edges": [{ "from": "1", "to": "2", "label": "connection" }] }
Layer values: frontend | backend | database | external | cache.
Max 12 nodes. Main architectural components only. No explanation.

Files:
${paths}

README snippets:
${readmeContent.substring(0, 500)}
`;

        const response = await ai.models.generateContent({
           model: 'gemini-3-flash-preview',
           contents: prompt
        });

        let json: any = { nodes: [], edges: [] };
        const text = response.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            json = JSON.parse(match[0]);
        }

        const explanationPrompt = `
Based on the following architecture diagram and file context, provide a brief (1-2 paragraph) explanation of how the system works. Keep it high-level and focus on the component interactions.

Diagram:
${JSON.stringify(json)}

Files:
${paths}
`;
        let explanation = "";
        try {
            const explanationResponse = await ai.models.generateContent({
                 model: 'gemini-3-flash-preview',
                 contents: explanationPrompt
            });
            explanation = explanationResponse.text || explanation;
        } catch(e) {
             console.error("Explanation error", e);
        }
        json.explanation = explanation;

        res.json(json);
    } catch (e: any) {
        console.error("Diagram error", e);
        res.status(500).json({ error: e.message || 'Failed to generate diagram' });
    }
  }));

  // FETCH REPO DETAILS ROUTE
  app.get('/api/repos/:owner/:name', (req, res) => {
      const repoId = `${req.params.owner}/${req.params.name}`;
      const repo = db.repos.get(repoId);
      if (repo) {
          res.json(repo);
      } else {
          res.status(404).json({ error: 'Not found' });
      }
  });

  // LIST REPOS
  app.get('/api/repos', (req, res) => {
      res.json({ repos: Array.from(db.repos.values()) });
  });

  app.get('/api/key-check', (req, res) => {
      res.json({ 
          key_exists: !!process.env.GEMINI_API_KEY,
          key_length: process.env.GEMINI_API_KEY?.length || 0,
          key_start: process.env.GEMINI_API_KEY?.substring(0, 4)
      });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
