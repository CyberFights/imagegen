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
 * POST /api/generate-image
 * Directly generates an image using Mistral's image generation API
 */
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = "1024x1024" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }

    // Step 1: Call Mistral image generation API
    const genResponse = await fetch("https://api.mistral.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        size
      })
    });

    if (!genResponse.ok) {
      const err = await genResponse.json();
      throw new Error(err.message || "Image generation failed");
    }

    const genData = await genResponse.json();
    const fileId = genData.data?.[0]?.file_id;

    if (!fileId) {
      throw new Error("No file_id returned from Mistral");
    }

    // Step 2: Get signed URL for the generated image
    const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}/signed_url`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!signedUrlResponse.ok) {
      const err = await signedUrlResponse.json();
      throw new Error(err.message || "Failed to fetch signed URL");
    }

    const signedUrlData = await signedUrlResponse.json();
    const imageUrl = signedUrlData.url;

    res.json({
      status: "success",
      file_id: fileId,
      image_url: imageUrl
    });

  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).json({ error: error.message });
  }
});
/**
 * POST /api/edit-image
 * Edits an existing image using Mistral's image editing API
 */
app.post('/api/edit-image', async (req, res) => {
  try {
    const { image_url, prompt, size = "1024x1024" } = req.body;

    if (!image_url || !prompt) {
      return res.status(400).json({ error: "Missing required fields: image_url, prompt" });
    }

    // Step 1: Call Mistral image editing API
    const editResponse = await fetch("https://api.mistral.ai/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url,
        prompt,
        size
      })
    });

    if (!editResponse.ok) {
      const err = await editResponse.json();
      throw new Error(err.message || "Image editing failed");
    }

    const editData = await editResponse.json();
    const fileId = editData.data?.[0]?.file_id;

    if (!fileId) {
      throw new Error("No file_id returned from Mistral");
    }

    // Step 2: Get signed URL
    const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}/signed_url`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!signedUrlResponse.ok) {
      const err = await signedUrlResponse.json();
      throw new Error(err.message || "Failed to fetch signed URL");
    }

    const signedUrlData = await signedUrlResponse.json();

    res.json({
      status: "success",
      file_id: fileId,
      image_url: signedUrlData.url
    });

  } catch (error) {
    console.error("Error editing image:", error);
    res.status(500).json({ error: error.message });
  }
});
/**
 * POST /api/variation-image
 * Generates variations of an existing image using Mistral's variation API
 */
app.post('/api/variation-image', async (req, res) => {
  try {
    const { image_url, size = "1024x1024", count = 1 } = req.body;

    if (!image_url) {
      return res.status(400).json({ error: "Missing required field: image_url" });
    }

    // Step 1: Call Mistral variation API
    const varResponse = await fetch("https://api.mistral.ai/v1/images/variations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url,
        size,
        n: count
      })
    });

    if (!varResponse.ok) {
      const err = await varResponse.json();
      throw new Error(err.message || "Image variation failed");
    }

    const varData = await varResponse.json();

    // Collect all file_ids
    const fileIds = varData.data.map(img => img.file_id);

    // Step 2: Fetch signed URLs for each variation
    const urls = [];
    for (const fileId of fileIds) {
      const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}/signed_url`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const signedUrlData = await signedUrlResponse.json();
      urls.push(signedUrlData.url);
    }

    res.json({
      status: "success",
      file_ids: fileIds,
      image_urls: urls
    });

  } catch (error) {
    console.error("Error generating variations:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
