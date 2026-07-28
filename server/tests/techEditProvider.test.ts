import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock('../src/services/openaiClient', () => ({
  getOpenAIClient: () => ({ responses: { parse: parseMock } }),
}));

import {
  TECH_EDIT_MODEL,
  buildDocumentPayload,
  runTechEdit,
} from '../src/services/techEdit';

describe('tech edit OpenAI provider', () => {
  beforeEach(() => parseMock.mockReset());

  it('uses the flagship OpenAI model selected for quality-first tech editing', () => {
    expect(TECH_EDIT_MODEL).toBe('gpt-5.6-sol');
  });

  it('sends PDFs as high-detail file inputs so charts remain legible', async () => {
    const payload = await buildDocumentPayload(
      Buffer.from('%PDF synthetic fixture'),
      'application/pdf',
      'shoulder-chart.pdf',
    );

    expect(payload.content).toEqual([
      {
        type: 'input_file',
        filename: 'shoulder-chart.pdf',
        file_data: expect.stringMatching(/^data:application\/pdf;base64,/),
        detail: 'high',
      },
    ]);
  });

  it('runs both passes through strict, stateless Responses API requests', async () => {
    parseMock
      .mockResolvedValueOnce({
        output_parsed: {
          patternTitle: 'Fixture scarf',
          language: 'English',
          craft: 'knitting',
          sizeNames: ['One size'],
          gauge: null,
          stitchCountEvents: [],
          measurementLinks: [],
          repeatInstructions: [],
          lengthLinks: [],
          constructionSignals: [],
          assemblyLinks: [],
          chartRows: [],
          abbreviationsDefined: [],
        },
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
      })
      .mockResolvedValueOnce({
        output_parsed: { summary: 'No issues found.', findings: [] },
        usage: { input_tokens: 110, output_tokens: 25, total_tokens: 135 },
      });

    const result = await runTechEdit(
      Buffer.from('Cast on 20 stitches. Knit 10 rows.'),
      'text/plain',
      'fixture.txt',
      { safetyIdentifier: 'anonymous-user-hash' },
    );

    expect(result.report.summary).toBe('No issues found.');
    expect(result.usage).toEqual({ promptTokens: 210, candidateTokens: 45, totalTokens: 255 });
    expect(parseMock).toHaveBeenCalledTimes(2);

    const extractionRequest = parseMock.mock.calls[0][0];
    expect(extractionRequest).toMatchObject({
      model: 'gpt-5.6-sol',
      reasoning: { effort: 'medium', context: 'current_turn' },
      store: false,
      safety_identifier: 'anonymous-user-hash',
      text: { format: { type: 'json_schema', name: 'tech_edit_extraction', strict: true } },
    });
    expect(extractionRequest.input[0].content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'input_text' })]),
    );

    expect(parseMock.mock.calls[1][0]).toMatchObject({
      model: 'gpt-5.6-sol',
      reasoning: { effort: 'medium', context: 'current_turn' },
      store: false,
      text: { format: { type: 'json_schema', name: 'tech_edit_editorial', strict: true } },
    });
  });
});
