import "dotenv/config";
import jwt from "jsonwebtoken";
import { env } from "./src/config/env.js";
import mongoose from "mongoose";

const token = jwt.sign(
  {
    id: "6676cf6c8d76d43e5c9b8e9f", // dummy id
    email: "admin.mumbai-chapter@rifah.org",
    role: "chapter_admin",
    chapterId: "6676cf6c8d76d43e5c9b8ea0",
    name: "Zaid"
  },
  env.JWT_SECRET,
  { expiresIn: "1h" }
);

async function run() {
  console.log("Triggering bug with token:", token);
  try {
    const res = await fetch("http://127.0.0.1:5000/api/v1/verification/6aa3f207c4160941980625bd/review", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ status: "rejected", remarks: "testing 2" })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch(err) {
    console.error("Fetch Error:", err);
  }
}

run();
