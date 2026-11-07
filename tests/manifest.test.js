// Manifests (chrome|firefox, dev and prod). Every permission is an install warning,
// and adding one later makes Chrome disable the extension until users re-approve it,
// so each build asks only for what its code uses.
// Run: node --test tests/*.test.js
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROLIFIC_HOST = "https://app.prolific.com/*";

// No "tabs": the Prolific host permission already shows Prolific tabs' URLs and titles,
// which is all the background and popup look at. "tabs" added a "Read your browsing
// history" warning (Chrome) / "Access browser tabs" (Firefox) for nothing.
const EXPECTED = {
    chrome: { permissions: ["storage", "notifications", "offscreen"], host_permissions: [PROLIFIC_HOST] },
    firefox: { permissions: ["storage", "notifications", PROLIFIC_HOST], host_permissions: undefined },
};

function readManifest(build, ...dirs) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", build, ...dirs, "manifest.json"), "utf8"));
}

for (const build of Object.keys(EXPECTED)) {
    describe(`${build} manifest`, () => {
        test("asks only for the permissions the extension uses", () => {
            // Arrange
            const manifest = readManifest(build, "prod");

            // Act
            const { permissions, host_permissions, optional_permissions } = manifest;

            // Assert
            assert.deepEqual({ permissions, host_permissions, optional_permissions },
                { ...EXPECTED[build], optional_permissions: undefined });
        });

        test("store build matches the development build", () => {
            // Arrange + Act
            const dev = readManifest(build);
            const prod = readManifest(build, "prod");

            // Assert
            assert.deepEqual(prod, dev);
        });
    });
}
