"use strict";
const express = require("express"),
  router = express.Router(),
  crypto = require("crypto"),
  request = require("request");

const Webfinger = require("./webfinger.js");
const axios = require("axios");
const { URL } = require("url");
const { signAndSend } = require("./inbox.js");

function createActor(name, domain, pubkey) {
  return {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
    ],

    id: `https://${domain}/u/${name}`,
    type: "Person",
    preferredUsername: `${name}`,
    inbox: `https://${domain}/api/inbox`,
    outbox: `https://${domain}/u/${name}/outbox`,
    followers: `https://${domain}/u/${name}/followers`,

    publicKey: {
      id: `https://${domain}/u/${name}#main-key`,
      owner: `https://${domain}/u/${name}`,
      publicKeyPem: pubkey,
    },
  };
}

function createWebfinger(name, domain) {
  return {
    subject: `acct:${name}@${domain}`,

    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `https://${domain}/u/${name}`,
      },
    ],
  };
}

router.post("/create", function (req, res) {
  // pass in a name for an account, if the account doesn't exist, create it!
  const account = req.body.account;
  if (account === undefined) {
    return res.status(400).json({
      msg: 'Bad request. Please make sure "account" is a property in the POST body.',
    });
  }
  let db = req.app.get("db");
  let domain = req.app.get("domain");
  // create keypair
  crypto.generateKeyPair(
    "rsa",
    {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    },
    (err, publicKey, privateKey) => {
      let actorRecord = createActor(account, domain, publicKey);
      let webfingerRecord = createWebfinger(account, domain);
      const apikey = crypto.randomBytes(16).toString("hex");
      try {
        db.prepare(
          "insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)"
        ).run(
          `${account}@${domain}`,
          JSON.stringify(actorRecord),
          apikey,
          publicKey,
          privateKey,
          JSON.stringify(webfingerRecord)
        );
        res.status(200).json({ msg: "ok", apikey });
      } catch (e) {
        res.status(200).json({ error: e });
      }
    }
  );
});
router.post("/follow", async (req, res) => {
  try {
    const { db, domain } = req.app.get;
    const { acct, apiKey: apikey, wantToFollow } = req.body;
    const [nameSend, domainSend] = acct.split("@");
    const targetdomain = wantToFollow.split("@")[1];

    const stmt = db.prepare("SELECT apikey FROM accounts WHERE name = ?");
    const result = stmt.get(acct);

    if (!result || result.apikey !== apikey) {
      return res.status(403).json({ msg: "Wrong API key" });
    }

    const webfingerUrl = `http://${targetdomain}/.well-known/webfinger?resource=acct:${wantToFollow}`;
    const {
      data: { links },
    } = await axios.get(webfingerUrl);
    const actorUrl = links.find((link) => link.rel === "self").href;
    const inboxUrl = `${actorUrl}/inbox`;

    const followActivity = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Follow",
      actor: `http://${domain}/u/${nameSend}`,
      object: actorUrl,
    };

    const inboxFragment = inboxUrl.replace(`https://${targetdomain}`, "");
    const privkeyQuery = db
      .prepare("select privkey from accounts where name = ?")
      .get(`${nameSend}@${domainSend}`);

    if (!privkeyQuery) {
      console.log(`No record found for ${nameSend}.`);
      return;
    }

    const privkey = privkeyQuery.privkey;
    const digestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(followActivity))
      .digest("base64");
    const signer = crypto.createSign("sha256");
    const d = new Date().toUTCString();
    const stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetdomain}\ndate: ${d}\ndigest: SHA-256=${digestHash}`;

    signer.update(stringToSign);
    signer.end();

    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString("base64");
    const header = `keyId="https://${domainSend}/u/${nameSend}",headers="(request-target) host date digest",signature="${signature_b64}"`;

    request(
      {
        url: inboxUrl,
        headers: {
          Host: targetdomain,
          Date: d,
          Digest: `SHA-256=${digestHash}`,
          Signature: header,
        },
        method: "POST",
        json: true,
        body: followActivity,
      },
      (error, response) => {
        if (error) {
          console.error("Error:", error, response);
        } else {
          console.log("Response Status Code:", response.statusCode);
        }
      }
    );

    res.status(200).json({ msg: "Follow initiated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});

module.exports = router;
