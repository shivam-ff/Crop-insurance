import jwt from "jsonwebtoken";

export function signToken({ jwtSecret, user }) {
  return jwt.sign(
    { sub: user.id, email: user.email, walletAddress: user.walletAddress },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

export function authMiddleware({ jwtSecret }) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const [, token] = h.split(" ");
    if (!token) return res.status(401).json({ ok: false, error: "missing bearer token" });
    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "invalid token" });
    }
  };
}

