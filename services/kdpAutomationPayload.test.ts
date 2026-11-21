import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDesktopAutomationPayload } from './kdpAutomationPayload.ts';

const source = {
  outline: { title: 'Tideglass', subtitle: 'A shore novel', tableOfContents: [{ chapter: 1, title: 'Dawn', summary: 'Opens', content: 'The tide came in.' }] },
  kdpMarketingInfo: { shortDescription: 'short', longDescription: 'long', categories: ['Fiction'], keywords: ['tide'], backCoverBlurb: 'blurb' },
  authorProfile: { name: 'Ada', contact: '', bio: 'Writes.', expertise: '', birthday: '', socialMedia: {} },
  coverImageUrl: 'data:image/jpeg;base64,QUJD',
  aiDisclosure: { aiGeneratedText: true, aiGeneratedImages: true, aiGeneratedTranslations: false, acknowledged: true },
  epubBlob: new Blob(['not-sent']),
  onClose: () => {
    throw new Error('must not be cloned');
  },
};

test('desktop automation payload is structured-cloneable and omits callbacks', () => {
  const epubDataUrl = 'data:application/epub+zip;base64,UEsDBA==';
  const payload = buildDesktopAutomationPayload(source, epubDataUrl);

  assert.equal(payload.epubBlob, epubDataUrl);
  assert.equal((payload.outline as { title: string }).title, 'Tideglass');
  assert.equal((payload.aiDisclosure as { acknowledged: boolean }).acknowledged, true);
  assert.equal('onClose' in payload, false);
  assert.equal('epubBlob' in payload && typeof payload.epubBlob, 'string');

  const cloned = structuredClone(payload);
  assert.deepEqual(cloned, payload);
  assert.equal(JSON.parse(JSON.stringify(payload)).epubBlob, epubDataUrl);
});
