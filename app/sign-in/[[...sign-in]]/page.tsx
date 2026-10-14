import { SignIn } from "@clerk/nextjs";
import { AuthSheet } from "@/components/auth-sheet";

export default function SignInPage() {
  return (
    <AuthSheet>
      <SignIn appearance={{ elements: { rootBox: { width: "100%" } } }} />
    </AuthSheet>
  );
}
