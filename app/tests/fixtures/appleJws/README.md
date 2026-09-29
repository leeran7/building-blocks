# Test-only App Store signing chain

A throwaway ECDSA P-256 chain shaped like Apple's (root, WWDR intermediate
with OID 1.2.840.113635.100.6.2.1, leaf with 1.2.840.113635.100.6.11.1),
valid for 100 years, for `tests/api/appleIap.test.ts`. `leaf.key` signs
fixture transactions. It is trusted nowhere: production pins Apple Root CA -
G3 by fingerprint (`src/api/appleJws.ts`), and the tests prove this chain
fails against that pin. `leaf-no-oid.pem` is the same leaf without the App
Store OID, for the negative case.
