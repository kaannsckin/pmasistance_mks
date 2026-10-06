/**
 * TÜBİTAK Kamu SM sertifika zinciri (herkese açık bilgi).
 *
 * Neden gerekli: ai-api.bilgem.tubitak.gov.tr yalnızca kendi sertifikasını
 * gönderir, onu imzalayan ara sertifikayı göndermez; kök sertifika (Sürüm 2)
 * da Node.js'in güven listesinde yoktur (listede yalnızca Sürüm 1 var).
 * Tarayıcılar eksiği kendileri tamamlar, Node.js tamamlamaz ve bağlantıyı
 * "unable to get local issuer certificate" hatasıyla keser.
 *
 * Bu sertifikalar yalnızca *.tubitak.gov.tr adreslerine yapılan AI isteklerinde
 * Node.js'in kendi güven listesine EK olarak kullanılır (bkz. tls.ts); başka
 * hiçbir bağlantı etkilenmez.
 *
 * Kaynak: https://ai.bilgem.tubitak.gov.tr/rehber/sertifika (sertifika-kur.sh)
 *  - Ara: TUBITAK Kamu SM SSL Sertifika Hizmet Saglayicisi - Surum 3 (2031-04-15'e kadar)
 *    SHA-256 AD:F8:19:10:82:61:5C:E6:5B:92:8E:25:61:B8:AC:75:1F:40:09:06:61:8B:D9:F5:88:89:63:A4:7F:18:E5:B0
 *  - Kök: TUBITAK Kamu SM SSL Kok Sertifikasi - Surum 2 (2040-06-12'ye kadar)
 *    SHA-256 EC:64:31:BA:9F:C1:3E:40:5D:F8:0A:DE:58:A0:48:13:6F:78:9A:03:FD:CA:4C:F5:DA:A4:33:6A:C5:22:22:5B
 */
export const TUBITAK_CA_PEM = `
-----BEGIN CERTIFICATE-----
MIIDmjCCAyCgAwIBAgILAOVi2+BOWnBqAN8wCgYIKoZIzj0EAwMwgYQxCzAJBgNV
BAYTAlRSMRAwDgYDVQQIEwdLb2NhZWxpMSswKQYDVQQKEyJUVUJJVEFLIEthbXUg
U2VydGlmaWthc3lvbiBNZXJrZXppMTYwNAYDVQQDEy1UVUJJVEFLIEthbXUgU00g
U1NMIEtvayBTZXJ0aWZpa2FzaSAtIFN1cnVtIDIwHhcNMjYwNDE1MTExMzU5WhcN
MzEwNDE1MTExMzU5WjCBkTELMAkGA1UEBhMCVFIxEDAOBgNVBAgMB0tvY2FlbGkx
KzApBgNVBAoMIlRVQklUQUsgS2FtdSBTZXJ0aWZpa2FzeW9uIE1lcmtlemkxQzBB
BgNVBAMMOlRVQklUQUsgS2FtdSBTTSBTU0wgU2VydGlmaWthIEhpem1ldCBTYWds
YXlpY2lzaSAtIFN1cnVtIDMwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAQb1VCVYTmt
sHxqd+ABlRUwvoLJgVcsDU4mXUPJf49S5v0ZZFJmGzemJ2gnVlQbhaxmrg94lOrW
VO/VVju9bMCVqfoUesRmy9JLnNEnCFeFO62M3xLsKfV64p9QZo/sXumjggFLMIIB
RzAfBgNVHSMEGDAWgBSEiMhAeVmVYOCtmXCkCQjkXc6fGzAdBgNVHQ4EFgQUqeEb
ATyWNEq9O+e25tdFOMwstL4wDgYDVR0PAQH/BAQDAgEGMBEGA1UdIAQKMAgwBgYE
VR0gADASBgNVHRMBAf8ECDAGAQH/AgEAMBMGA1UdJQQMMAoGCCsGAQUFBwMBMD8G
A1UdHwQ4MDYwNKAyoDCGLmh0dHA6Ly9kZXBvLmthbXVzbS5nb3YudHIvc3NsL1NT
TEtPS1NJTC5TMi5jcmwweAYIKwYBBQUHAQEEbDBqMDkGCCsGAQUFBzAChi1odHRw
Oi8vZGVwby5rYW11c20uZ292LnRyL3NzbC9TU0xLT0tTTS5TMi5jZXIwLQYIKwYB
BQUHMAGGIWh0dHA6Ly9vY3Nwc3Nsa29rczIua2FtdXNtLmdvdi50cjAKBggqhkjO
PQQDAwNoADBlAjAeeuDliMfsmTAQLRDg58A0w9TsrxlL2ddM5TzdVnfssF3SKdst
0dDXgUARYd8d92cCMQC08EYFdUcVVHB+xzbTc1nMnRPGTf3fiH02h/AgPlyPfYkI
glevpiPva2zqiwhSTQM=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICozCCAiigAwIBAgIKa+bYyoiaSmcAzDAKBggqhkjOPQQDAzCBhDELMAkGA1UE
BhMCVFIxEDAOBgNVBAgTB0tvY2FlbGkxKzApBgNVBAoTIlRVQklUQUsgS2FtdSBT
ZXJ0aWZpa2FzeW9uIE1lcmtlemkxNjA0BgNVBAMTLVRVQklUQUsgS2FtdSBTTSBT
U0wgS29rIFNlcnRpZmlrYXNpIC0gU3VydW0gMjAeFw0yNTA2MTYwODQzMzBaFw00
MDA2MTIwODQzMzBaMIGEMQswCQYDVQQGEwJUUjEQMA4GA1UECBMHS29jYWVsaTEr
MCkGA1UEChMiVFVCSVRBSyBLYW11IFNlcnRpZmlrYXN5b24gTWVya2V6aTE2MDQG
A1UEAxMtVFVCSVRBSyBLYW11IFNNIFNTTCBLb2sgU2VydGlmaWthc2kgLSBTdXJ1
bSAyMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE5qrYApwSUiphrD5JrPAt1kf2Cbg3
Q8PoYNoU+bQ4RqCXwf5pDpgy/VXq2SERHlsD/XRW3EanKt/FJ7iRacY7jcjbhlwy
djF/wyNSB/Z95KYLj8gdHcU5BsqBTZjIfGovo2MwYTAfBgNVHSMEGDAWgBSEiMhA
eVmVYOCtmXCkCQjkXc6fGzAdBgNVHQ4EFgQUhIjIQHlZlWDgrZlwpAkI5F3Onxsw
DgYDVR0PAQH/BAQDAgEGMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwMDaQAw
ZgIxAJw9X7MjrKOl13Iq4kamWi66g5ErkjwGYGEFmkeQvDy8/LTXogb20S4gFeIl
gQJ9ogIxALhTp0Zg2w/5CWzdLaNz1sHhJtoelAJ+qancUQpqYuS2DF8BZQ1AbhmT
qv8f6msEbg==
-----END CERTIFICATE-----
`;
