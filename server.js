// server.js
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// API key (still loaded in case you need it later)
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

// REMOVE: /api/create-image-agent endpoint
// Entire agent creation logic has been removed.

// Example placeholder route (optional)
app.get('/api/status', (req, res) => {
  res.json({ status: 'server running' });
});
/**
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = "1024x1024" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }

    // Step 1: Generate image
    const genResponse = await fetch("https://api.mistral.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "pixtral-12b",   // REQUIRED
        prompt,
        size
      })
    });

    const genData = await genResponse.json();

    if (!genResponse.ok) {
      throw new Error(genData.message || "Image generation failed");
    }

    const fileId = genData?.data?.[0]?.file_id;

    if (!fileId) {
      throw new Error("Mistral did not return a file_id");
    }

    // Step 2: Get signed URL
    const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}/signed_url`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const signedUrlData = await signedUrlResponse.json();

    if (!signedUrlResponse.ok) {
      throw new Error(signedUrlData.message || "Failed to fetch signed URL");
    }

    res.json({
      status: "success",
      file_id: fileId,
      image_url: signedUrlData.url
    });

  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
