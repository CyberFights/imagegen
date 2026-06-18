// server.js
import express from 'express';
import dotenv from 'dotenv';
import FormData from 'form-data';
import fetch from 'node-fetch'; // Remove this line if you're on Node 18+ and using global fetch

dotenv.config();

const app = express();
app.use(express.json());

// --- ENV ---------------------------------------------------------------------

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const AGENT_ID = process.env.AGENT_ID;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const PORT = process.env.PORT || 3000;

if (!MISTRAL_API_KEY) {
  console.error('Error: MISTRAL_API_KEY is not set in .env file');
  process.exit(1);
}
if (!AGENT_ID) {
  console.error('Error: AGENT_ID is not set in .env file');
  process.exit(1);
}
if (!IMGBB_API_KEY) {
  console.error('Error: IMGBB_API_KEY is not set in .env file');
  process.exit(1);
}

// --- HELPERS -----------------------------------------------------------------

function extractApiError(err) {
  if (!err) return 'Unknown error';

  // Mistral often returns { errors: [ { message } ] }
  if (Array.isArray(err.errors)) {
    return err.errors
      .map(e => e.message || JSON.stringify(e))
      .join(' | ');
  }

  // Sometimes { error: { message } }
  if (err.error && err.error.message) {
    return err.error.message;
  }

  // Sometimes just { message }
  if (err.message) return err.message;

  return JSON.stringify(err);
}

// --- ROUTES ------------------------------------------------------------------

/**
 * POST /api/generate-image
 * Body: { input_prompt: string, temperature?: number, top_p?: number }
 */
app.post('/api/generate-image', async (req, res) => {
  try {
    const {
      input_prompt,
      temperature = 0.3,
      top_p = 0.95,
    } = req.body;

    if (!input_prompt) {
      return res.status(400).json({
        error: 'Missing required field: input_prompt',
      });
    }

    // 1) Start conversation with Mistral agent
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
      let errorBody;
      try {
        errorBody = await conversationResponse.json();
      } catch {
        errorBody = null;
      }
      throw new Error(
        extractApiError(errorBody) || 'Failed to start conversation with Mistral'
      );
    }

    const conversation = await conversationResponse.json();
    const conversationId = conversation.conversation_id;

    // 2) Extract file_id from tool_file chunk
    let fileId = null;
    const outputs = conversation.outputs || [];
    const lastOutput = outputs[outputs.length - 1];

    if (lastOutput?.content && Array.isArray(lastOutput.content)) {
      for (const chunk of lastOutput.content) {
        if (chunk.type === 'tool_file' && chunk.file_id) {
          fileId = chunk.file_id;
          break;
        }
      }
    }

    if (!fileId) {
      return res.status(500).json({
        error: 'No image generated in the response (no tool_file found)',
      });
    }

    // 3) Get signed URL for the generated image
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
      let errorBody;
      try {
        errorBody = await signedUrlResponse.json();
      } catch {
        errorBody = null;
      }
      throw new Error(
        extractApiError(errorBody) || 'Failed to get signed URL from Mistral'
      );
    }

    const signedUrlData = await signedUrlResponse.json();
    const imageSignedUrl = signedUrlData.url;

    if (!imageSignedUrl) {
      return res.status(500).json({
        error: 'Signed URL missing in Mistral response',
      });
    }

    // 4) Download the image from Mistral
    const imageDownloadResponse = await fetch(imageSignedUrl);
    if (!imageDownloadResponse.ok) {
      throw new Error('Failed to download image from Mistral');
    }

    const imageBuffer = await imageDownloadResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // 5) Upload to ImgBB (multipart/form-data)
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
      let errorBody;
      try {
        errorBody = await imgbbUploadResponse.json();
      } catch {
        errorBody = null;
      }
      throw new Error(
        extractApiError(errorBody) || 'Failed to upload image to ImgBB'
      );
    }

    const imgbbResponse = await imgbbUploadResponse.json();
    const imgbbImageUrl = imgbbResponse?.data?.url;

    if (!imgbbImageUrl) {
      return res.status(500).json({
        error: 'ImgBB did not return an image URL',
      });
    }

    // 6) Success response
    return res.json({
      status: 'success',
      agent_id: AGENT_ID,
      conversation_id: conversationId,
      file_id: fileId,
      image_url: imgbbImageUrl,
    });

  } catch (err) {
    console.error('Error generating image:', err);
    return res.status(500).json({
      error: err.message || 'Failed to generate image',
    });
  }
});

// --- SERVER ------------------------------------------------------------------

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using agent ID: ${AGENT_ID}`);
});
