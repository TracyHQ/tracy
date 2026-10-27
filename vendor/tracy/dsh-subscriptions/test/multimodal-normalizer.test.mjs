import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDataUri,
  normalizeImage,
  extractImages,
  toOpenAiImage,
  toAnthropicImage,
  toGeminiImage,
  toCodexImage,
} from '../lib/images.js'
import {
  openaiMessages,
  anthropicPayload,
  googleContents,
  codexResponsesBody,
} from '../lib/messages.js'

test('parseDataUri correctly extracts mimeType and base64 payload', () => {
  assert.equal(parseDataUri('not a data uri'), null)
  assert.deepEqual(parseDataUri('data:image/png;base64,iVBORw0KGgo='), {
    mimeType: 'image/png',
    base64: 'iVBORw0KGgo=',
  })
})

test('normalizeImage parses various vendor image representations', () => {
  // String data URI
  const dUri = 'data:image/png;base64,iVBORw0KGgo='
  const norm1 = normalizeImage(dUri)
  assert.equal(norm1.mimeType, 'image/png')
  assert.equal(norm1.base64, 'iVBORw0KGgo=')

  // HTTP URL
  const url = 'https://example.com/photo.jpg'
  const norm2 = normalizeImage(url)
  assert.equal(norm2.url, url)

  // Anthropic source block
  const anthropic = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/webp',
      data: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEADsAcJaQAA3AAAAAA',
    },
  }
  const norm3 = normalizeImage(anthropic)
  assert.equal(norm3.mimeType, 'image/webp')
  assert.equal(norm3.base64, anthropic.source.data)

  // Gemini inlineData block
  const gemini = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: '/9j/4AAQSkZJRgABAQEASABIAAD/',
    },
  }
  const norm4 = normalizeImage(gemini)
  assert.equal(norm4.mimeType, 'image/jpeg')
  assert.equal(norm4.base64, gemini.inlineData.data)

  // OpenAI image_url block
  const oai = {
    type: 'image_url',
    image_url: { url: dUri },
  }
  const norm5 = normalizeImage(oai)
  assert.equal(norm5.mimeType, 'image/png')
  assert.equal(norm5.base64, 'iVBORw0KGgo=')
})

test('converters generate expected vendor structures', () => {
  const norm = {
    mimeType: 'image/png',
    base64: 'iVBORw0KGgo=',
    url: 'data:image/png;base64,iVBORw0KGgo=',
  }

  assert.deepEqual(toOpenAiImage(norm), {
    type: 'image_url',
    image_url: { url: norm.url },
  })

  assert.deepEqual(toAnthropicImage(norm), {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgo=',
    },
  })

  assert.deepEqual(toGeminiImage(norm), {
    inlineData: {
      mimeType: 'image/png',
      data: 'iVBORw0KGgo=',
    },
  })

  assert.deepEqual(toCodexImage(norm), {
    type: 'input_image',
    image_url: norm.url,
  })
})

test('openaiMessages converts multimodal user content into content parts', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this image:' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw0KGgo=',
          },
        },
      ],
    },
  ]

  const out = openaiMessages({ messages })
  assert.equal(out.length, 1)
  assert.equal(out[0].role, 'user')
  assert.ok(Array.isArray(out[0].content))
  assert.equal(out[0].content[0].type, 'text')
  assert.equal(out[0].content[0].text, 'Analyze this image:')
  assert.equal(out[0].content[1].type, 'image_url')
  assert.equal(out[0].content[1].image_url.url, 'data:image/png;base64,iVBORw0KGgo=')
})

test('anthropicPayload converts multimodal user content into anthropic image blocks', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe image' },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'abc123xyz',
          },
        },
      ],
    },
  ]

  const payload = anthropicPayload({ model: 'claude-3-7-sonnet-20250219', messages })
  const blocks = payload.messages[0].content
  assert.equal(blocks[0].type, 'text')
  assert.equal(blocks[0].text, 'Describe image')
  assert.equal(blocks[1].type, 'image')
  assert.deepEqual(blocks[1].source, {
    type: 'base64',
    media_type: 'image/jpeg',
    data: 'abc123xyz',
  })
})

test('googleContents converts multimodal user content into inlineData parts', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Look at this:' },
        'data:image/png;base64,iVBORw0KGgo=',
      ],
    },
  ]

  const contents = googleContents({ messages })
  const parts = contents.contents[0].parts
  assert.equal(parts[0].text, 'Look at this:')
  assert.deepEqual(parts[1], {
    inlineData: {
      mimeType: 'image/png',
      data: 'iVBORw0KGgo=',
    },
  })
})

test('codexResponsesBody converts multimodal user content into input_image items', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Question' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/diagram.png' },
        },
      ],
    },
  ]

  const body = codexResponsesBody({ model: 'o3-mini', messages })
  const userContent = body.input[0].content
  assert.equal(userContent[0].type, 'input_text')
  assert.equal(userContent[0].text, 'Question')
  assert.equal(userContent[1].type, 'input_image')
  assert.equal(userContent[1].image_url, 'https://example.com/diagram.png')
})

test("extractImages extracts multiple image items from message content", () => {
  const content = [
    { type: "text", text: "hello" },
    { type: "image_url", image_url: { url: "https://example.com/1.png" } },
    { inlineData: { mimeType: "image/jpeg", data: "abcd" } },
  ];
  const images = extractImages(content);
  assert.equal(images.length, 2);
  assert.equal(images[0].url, "https://example.com/1.png");
  assert.equal(images[1].mimeType, "image/jpeg");
});

test("toAnthropicImage and toGeminiImage preserve remote HTTP image URLs (#404)", () => {
  const norm = { mimeType: "image/png", base64: null, url: "http://example.com/cat.png" }
  const anthropic = toAnthropicImage(norm)
  assert.equal(anthropic.type, "image")
  assert.equal(anthropic.source.type, "url")
  assert.equal(anthropic.source.url, "http://example.com/cat.png")

  const gemini = toGeminiImage(norm)
  assert.equal(gemini.fileData.mimeType, "image/png")
  assert.equal(gemini.fileData.fileUri, "http://example.com/cat.png")
})
