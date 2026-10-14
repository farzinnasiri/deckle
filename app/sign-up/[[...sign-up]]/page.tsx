import { SignUp } from "@clerk/nextjs";
import { AuthSheet } from "@/components/auth-sheet";

export default function SignUpPage() {
  return (
    <AuthSheet>
      <SignUp appearance={{ elements: { rootBox: { width: "100%" } } }} />
    </AuthSheet>
  );
}
