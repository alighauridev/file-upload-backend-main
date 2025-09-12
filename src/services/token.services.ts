import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../env";

type TokenPayload = {
   userId: string;
   email: string;
   tokenVersion: number;
   loopDelay: number;
};

class TokenService {
   public static async generateTokens(payload: TokenPayload) {
      const accessToken = jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
         expiresIn: env.ACCESS_TOKEN_EXPIRE as SignOptions["expiresIn"]
      });

      return { accessToken };
   }

   public static verfiyAccessToken(token: string) {
      try {
         return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
      } catch (error: any) {
         if (error instanceof jwt.TokenExpiredError) {
            throw new Error("TOKEN_EXPIRED");
         } else if (error instanceof jwt.JsonWebTokenError) {
            throw new Error("INVALID_TOKEN");
         } else {
            throw new Error("TOKEN_VERIFICATION_FAILED");
         }
      }
   }
}

export default TokenService;
