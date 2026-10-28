import gzip
import hashlib
import io
import json
import re
import subprocess
import sys
import tarfile

secrets = []
PUBLIC_TEST_KEYS = globals().get("PUBLIC_TEST_KEYS", {})
findings = 0
locations = []
public_test_keys = []
members = 0
patterns = [re.compile(rb"\bAIza[0-9A-Za-z_-]{30,}"), re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"), re.compile(rb"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{20}")]

def scan(handle, location):
    global findings
    tail = b""
    while True:
        block = handle.read(1024 * 1024)
        if not block:
            break
        value = tail + block
        reasons = [name for name, secret in secrets if secret in value]
        for index, pattern in enumerate(patterns):
            if not pattern.search(value):
                continue
            public = globals().get("PUBLIC_TEST_KEYS", {})
            pem_values = re.findall(rb"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC )?PRIVATE KEY-----", value)
            pem_values = [pem for pem in pem_values if pattern.search(pem)]
            fingerprints = [hashlib.sha256(pem.replace(b"\r", b"")).hexdigest() for pem in pem_values]
            if index == 2 and location == public.get("allowedPath") and fingerprints and len(pattern.findall(value)) == len(fingerprints) and all(fingerprint in public.get("keys", []) for fingerprint in fingerprints):
                public_test_keys.append({"location": location, "fingerprints": fingerprints, "sourceBlob": public["blob"]})
            else:
                reasons.append("credential-format-" + str(index))
                if index == 2:
                    locations.append({"location": location, "unrecognizedPemFingerprints": fingerprints, "formatMatches": len(pattern.findall(value))})
        if reasons:
            findings += 1
            locations.append({"location": location, "reasons": sorted(set(reasons))})
        tail = value[-1024:]

def self_test():
    global secrets, findings, locations, public_test_keys, PUBLIC_TEST_KEYS
    saved = (secrets, findings, locations, public_test_keys, PUBLIC_TEST_KEYS)
    pem = b"-----BEGIN PRIVATE KEY-----\n" + b"A" * 64 + b"\n-----END PRIVATE KEY-----"
    path = "vendor-public-test-key"
    fingerprint = hashlib.sha256(pem).hexdigest()
    try:
        PUBLIC_TEST_KEYS = {"allowedPath": path, "keys": [fingerprint], "blob": "unit-test-only"}
        cases = [
            ([("KNOWN", b"configured-value-123456")], b"configured-value-123456", path, True),
            ([], pem, path, False),
            ([], pem, "application-private-key", True),
            ([("KNOWN", pem)], pem, path, True),
            ([], pem.replace(b"A" * 64, b"B" * 64), path, True),
            ([], pem + b"\n" + pem.replace(b"A" * 64, b"B" * 64), path, True),
        ]
        for configured, data, location, rejected in cases:
            secrets, findings, locations, public_test_keys = configured, 0, [], []
            scan(io.BytesIO(data), location)
            if bool(findings) != rejected:
                raise RuntimeError("Image scanner negative-case assertion failed")
        return len(cases)
    finally:
        secrets, findings, locations, public_test_keys, PUBLIC_TEST_KEYS = saved

self_tests = self_test()
if "--self-test" in sys.argv:
    print(json.dumps({"status": "PASS", "selfTests": self_tests}))
    raise SystemExit(0)

for name in ("/opt/shopfast/.env", "/opt/shopfast/app.env"):
    with open(name, encoding="utf-8") as handle:
        for line in handle:
            key, separator, value = line.strip().partition("=")
            value = value.strip("\"'")
            if separator and re.search(r"KEY|TOKEN|SECRET|PASSWORD", key) and len(value) >= 12:
                secrets.append((key, value.encode()))
if not secrets:
    raise RuntimeError("No configured values available for image scanning")
with open("/opt/shopfast/release.json", encoding="utf-8") as handle:
    release = json.load(handle)
images = [release["appImageId"], "ghcr.io/tuanpham2xx3/shopfast-module6-web:" + release["commit"]]

for image in images:
    process = subprocess.Popen(["docker", "image", "save", image], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                members += 1
                handle = archive.extractfile(member)
                # Docker save can contain gzip OCI layer blobs as well as plain tar layers.
                first = handle.read(512)
                class PrefixReader:
                    def __init__(self, prefix, source):
                        self.prefix, self.source = prefix, source
                    def read(self, count=-1):
                        if count < 0:
                            data, self.prefix = self.prefix + self.source.read(), b""
                            return data
                        data, self.prefix = self.prefix[:count], self.prefix[count:]
                        return data + self.source.read(count - len(data))
                stream = PrefixReader(first, handle)
                if first[:4] == b"\x28\xb5\x2f\xfd":
                    raise RuntimeError("Unsupported zstd layer; refusing incomplete scan")
                def scan_layer(stream):
                    with tarfile.open(fileobj=stream, mode="r|") as layer:
                        for item in layer:
                            if item.isfile():
                                scan(layer.extractfile(item), item.name)
                if first[:2] == b"\x1f\x8b":
                    with gzip.GzipFile(fileobj=stream) as decoded:
                        scan_layer(decoded)
                elif len(first) >= 262 and first[257:262] == b"ustar":
                    scan_layer(stream)
                else:
                    scan(stream, member.name)
        if process.wait(timeout=30) != 0:
            raise RuntimeError("Image archive failed")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
print(json.dumps({"targetCommit": release["commit"], "images": len(images), "archiveMembers": members, "configuredValues": len(secrets), "findings": findings, "locations": locations, "selfTests": self_tests, "reviewedPublicTestKeys": public_test_keys, "status": "PASS" if findings == 0 else "FAIL"}))
raise SystemExit(0 if findings == 0 else 1)
