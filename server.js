// server.js
import express from 'express';
import dotenv from 'dotenv';
import FormData from 'form-data';

dotenv.config();

const app = express();
app.use(express.json());

// ENV
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const AGENT_ID = process.env.AGENT_ID;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// Validate env
if (!AGENT_ID) {
  console.error('Error: AGENT_ID is not set in .env file');
  process.exit(1);
}
if (!IMGBB_API_KEY) {
  console.error('Error: IMGBB_API_KEY is not set in .env file');
  process.exit(1);
}

// Helper to extract readable errors
function extractMistralError(err) {
  if (!err) return 'Unknown error';

  if (Array.isArray(err.errors)) {
    return err.errors
      .map(e => e.message || JSON.stringify(e))
      .join(' | ');
  }

  if (err.message) return err.message;

  return JSON.stringify(err);
}

/**
 * POST /api/generate-image
 */
app.post('/api/generate-image', async (req, res) => {
  try {
    const { input_prompt, temperature = 0.3, top_p = 0.95 } = req.body;

    if (!input_prompt) {
      return res.status(400).json({ error: 'Missing required field: input_prompt' });
    }

    // Step 1 — Start conversation with Mistral agent
    const conversationResponse = await fetch('https://api.mistral.ai/v1/conversations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        inputs: input_prompt,
        temperature,
        top_p,
      }),
    });

    if (!conversationResponse.ok) {
      const error = await conversationResponse.json();
      throw new Error(extractMistralError(error));
    }

    const conversation = await conversationResponse.json();
    const conversationId = conversation.conversation_id;

    // Step 2 — Extract file_id from tool_file chunk
    let fileId = null;
    const lastOutput = conversation.outputs?.[conversation.outputs.length - 1];

    if (lastOutput?.content) {
      for (const chunk of lastOutput.content) {
        if (chunk.type === 'tool_file') {
          fileId = chunk.file_id;
          break;
        }
      }
    }

    if (!fileId) {
      return res.status(500).json({ error: 'No image generated in the response' });
    }

    // Step 3 — Get signed URL
    const signedUrlResponse = await fetch(
      `https://api.mistral.ai/v1/files/${fileId}/signed_url`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!signedUrlResponse.ok) {
      const error = await signedUrlResponse.json();
      throw new Error(extractMistralError(error));
    }

    const signedUrlData = await signedUrlResponse.json();
    const imageSignedUrl = signedUrlData.url;

    // Step 4 — Download image
    const imageDownloadResponse = await fetch(imageSignedUrl);
    if (!imageDownloadResponse.ok) {
      throw new Error('Failed to download image from Mistral');
    }

    const imageBuffer = await imageDownloadResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Step 5 — Upload to ImgBB (multipart/form-data)
    const form = new FormData();
    form.append('image', imageBase64);

    const imgbbUploadResponse = await fetch(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      }
    );

    if (!imgbbUploadResponse.ok) {
      const error = await imgbbUploadResponse.json();
      throw new Error(extractMistralError(error));
    }

    const imgbbResponse = await imgbbUploadResponse.json();
    const imgbbImageUrl = imgbbResponse.data.url;

    // Success
    res.json({
      status: 'success',
      agent_id: AGENT_ID,
      conversation_id: conversationId,
      file_id: fileId,
      image_url: imgbbImageUrl,
    });

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate image',
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using agent ID: ${AGENT_ID}`);
});
