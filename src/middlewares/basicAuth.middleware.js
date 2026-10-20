import { createHash, timingSafeEqual } from "crypto";

const expectedUsername = process.env.BASIC_AUTH_USERNAME;
const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

if (!expectedUsername || !expectedPassword) {
    throw new Error("Basic Auth credentials are missing...");
}

const securelyEqual = (actual, expected) => {
    const hash = (value) => {
        return createHash("sha256").update(value).digest();
    }

    return timingSafeEqual(hash(actual), hash(expected));
}

export default (req, res, next) => { 
    const unauthorized = () => {
        res.set("WWW-Authenticate", 'Basic realm="Admin Registration"');

        return res.status(401).json({
            message: "Invalid or missing authentication credentials"
        });
    };

    const header = req.get('Authorization') || '';
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);

    if (!match) return unauthorized();
    
    const credentials = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = credentials.indexOf(':');

    if (separator === -1) return unauthorized();
    
    const username = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);

    const validateUsername = securelyEqual(username, expectedUsername);
    const validatePassword = securelyEqual(password, expectedPassword);

    if (!validateUsername || !validatePassword) return unauthorized();
    next();
 }