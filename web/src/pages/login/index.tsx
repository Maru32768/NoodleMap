import { LoadableButton } from "@/components/loadable-button.tsx";
import { Field } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/use-auth.ts";
import { SEARCH_PATH } from "@/utils/path.ts";
import { Flex, Input, VStack } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";

function getSafeRedirectTo(searchParams: URLSearchParams) {
  const redirectTo = searchParams.get("redirectTo");

  if (
    !redirectTo ||
    !redirectTo.startsWith("/") ||
    redirectTo.startsWith("//")
  ) {
    return SEARCH_PATH;
  }

  return redirectTo;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const form = useForm<{
    email: string;
    password: string;
  }>();

  return (
    <Flex boxSize="full" justifyContent="center" paddingTop={10}>
      <VStack
        height="fit-content"
        width="30rem"
        bg="gray.100"
        padding={10}
        borderRadius="md"
      >
        <Field label="メール">
          <Input bg="white" {...form.register("email", { required: true })} />
        </Field>
        <Field label="パスワード">
          <Input
            bg="white"
            type="password"
            {...form.register("password", { required: true })}
          />
        </Field>
        <LoadableButton
          disabled={!form.formState.isValid}
          onClick={() => {
            const values = form.getValues();
            return login(values.email, values.password).then(() => {
              navigate(getSafeRedirectTo(searchParams), { replace: true });
            });
          }}
        >
          ログイン
        </LoadableButton>
      </VStack>
    </Flex>
  );
}
