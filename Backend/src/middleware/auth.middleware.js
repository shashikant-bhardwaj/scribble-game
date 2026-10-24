import { asyncHandler } from "./user.middleware.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";

const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace(`Bearer `, ``);
    if (!token) {
      throw new ApiError(401, `unauthorized access`);
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!decodedToken) {
      throw new ApiError(401, `invalid token`);
    }

    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, `user not found`);
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, `invalid access token`);
  }
});

export { verifyJWT };
