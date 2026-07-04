import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyLimits } from './discord.js';
import { buildMocks } from './mocks.js';
import { Message, Embed } from './common.js';

describe('discord.ts applyLimits unit tests', () => {
  test('trims content if it exceeds CONTENT_LENGTH limit', () => {
    const [ctx] = buildMocks();
    ctx.limits = { CONTENT_LENGTH: 2000, DESC_LENGTH: 4096, EMBED_COUNT: 10, PAYLOAD_LENGTH: 6000 };
    
    // Limits are scaled by 0.9. CONTENT_LENGTH = Math.floor(2000 * 0.9) = 1800
    const longContent = 'A'.repeat(2000);
    const messages: Message[] = [{
      content: longContent,
      embeds: [],
    }];

    const result = applyLimits(ctx, messages);
    assert.strictEqual(result.length, 1);
    let payloads = result.map(p => JSON.parse(p));
    assert.strictEqual(payloads[0].content?.length, 1800);
    assert.strictEqual(payloads[0].content?.endsWith('...'), true);
  });

  test('splits message if embed count exceeds EMBED_COUNT limit', () => {
    const [ctx] = buildMocks();
    ctx.limits = { CONTENT_LENGTH: 2000, DESC_LENGTH: 4096, EMBED_COUNT: 10, PAYLOAD_LENGTH: 6000 };
    
    // EMBED_COUNT = Math.floor(10 * 0.9) = 9
    const embeds: Embed[] = Array.from({ length: 15 }, (_, i) => ({ title: `Embed ${i}`, fields: [] }));
    const messages: Message[] = [{
      content: 'hello',
      embeds,
    }];

    const result = applyLimits(ctx, messages);
    // Should split into two messages: 9 embeds and 6 embeds
    assert.strictEqual(result.length, 2);
    let payloads = result.map(p => JSON.parse(p));
    assert.strictEqual(payloads[0].embeds.length, 9);
    assert.strictEqual(payloads[1].embeds.length, 6);
    assert.strictEqual(payloads[0].content, 'hello');
    assert.strictEqual(payloads[1].content, 'hello');
  });

  test('splits message if payload size exceeds PAYLOAD_LENGTH limit', () => {
    const [ctx] = buildMocks();
    ctx.limits = { CONTENT_LENGTH: 2000, DESC_LENGTH: 4096, EMBED_COUNT: 10, PAYLOAD_LENGTH: 6000 };
    
    // PAYLOAD_LENGTH = Math.floor(6000 * 0.9) = 5400
    // Create large embeds
    const largeEmbed1: Embed = { title: '1', description: 'B'.repeat(3000), fields: [] };
    const largeEmbed2: Embed = { title: '2', description: 'C'.repeat(3000), fields: [] };
    const messages: Message[] = [{
      content: 'hello',
      embeds: [largeEmbed1, largeEmbed2],
    }];

    const result = applyLimits(ctx, messages);
    // The two embeds combined exceed 5400 bytes, so they should be split into two messages
    assert.strictEqual(result.length, 2);
    let payloads = result.map(p => JSON.parse(p));
    assert.strictEqual(payloads[0].embeds.length, 1);
    assert.strictEqual(payloads[1].embeds.length, 1);
    assert.strictEqual(payloads[0].embeds[0].title, '2'); // Wait, splitMessageByPayloadSize uses pop() so it reverses the order
    assert.strictEqual(payloads[1].embeds[0].title, '1');
  });

  test('drops embed if a single embed exceeds PAYLOAD_LENGTH budget', () => {
    const [ctx] = buildMocks();
    ctx.limits = { CONTENT_LENGTH: 2000, DESC_LENGTH: 4096, EMBED_COUNT: 10, PAYLOAD_LENGTH: 6000 };
    
    const extremelyLargeEmbed: Embed = { title: 'huge', description: 'D'.repeat(6000), fields: [] };
    const normalEmbed: Embed = { title: 'normal', description: 'hello', fields: [] };
    const messages: Message[] = [{
      content: 'hello',
      embeds: [extremelyLargeEmbed, normalEmbed],
    }];

    const result = applyLimits(ctx, messages);
    // The huge embed is dropped. pop() processes normalEmbed first, then huge embed.
    assert.strictEqual(result.length, 1);
    const payload = JSON.parse(result[0]);
    assert.strictEqual(payload.embeds.length, 1);
    assert.strictEqual(payload.embeds[0].title, 'normal');
  });
});
