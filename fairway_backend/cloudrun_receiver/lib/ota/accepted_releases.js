'use strict';

// Only CPO-accepted, independently signature-verified bytes may be published.
const PRODUCTION_FINGERPRINT = 'sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb';
const ACCEPTED_RELEASES = Object.freeze({
  'OTA-0.1': '98687914b7ff0b7ab9116a7fff34d525b67c96955f84d06a24bd349538240f40',
  'OTA-0.1alt': '0ba9922abd81af93c721a37ac3d4c7ba2739cef24eaa7e56966c812865089cd4',
  'OTA-1.0': 'eab949f43a87949708e2764299464521e01688afe3307a1fe2444d92aa8d06b0',
  'OTA-0.1alt-r2': '2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844',
  'OTA-1.0-r2': '21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c',
});

module.exports = { ACCEPTED_RELEASES, PRODUCTION_FINGERPRINT };
