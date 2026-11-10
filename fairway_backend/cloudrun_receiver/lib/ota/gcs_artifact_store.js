'use strict';

const { Storage } = require('@google-cloud/storage');

function createGcsArtifactStore(bucketName, storage = null) {
  if (typeof bucketName !== 'string' || bucketName.trim() === '') return null;
  const bucket = (storage || new Storage()).bucket(bucketName);

  return {
    async upload(objectPath, bytes, metadata) {
      const file = bucket.file(objectPath);
      try {
        await file.save(bytes, {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: 'application/octet-stream',
            cacheControl: 'private, no-store',
            metadata,
          },
        });
      } catch (error) {
        if (Number(error.code) !== 412) throw error;
        const [existing] = await file.getMetadata();
        if (Number(existing.size) !== bytes.length
            || existing.metadata?.sha256 !== metadata.sha256
            || existing.metadata?.release_id !== metadata.release_id) {
          throw new Error('Existing immutable OTA object does not match the approved release.');
        }
      }
    },
    async getMetadata(objectPath) {
      const [metadata] = await bucket.file(objectPath).getMetadata();
      return metadata;
    },
    createReadStream(objectPath, options = {}) {
      return bucket.file(objectPath).createReadStream(options);
    },
  };
}

module.exports = { createGcsArtifactStore };
