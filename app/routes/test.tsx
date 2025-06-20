// app/routes/test.tsx
import { json } from "@remix-run/node";

export const loader = () => {
  return json({ message: "Hello from static route!" });
};

export default function TestRoute() {
  return <h1>Hello from static route!</h1>;
}
