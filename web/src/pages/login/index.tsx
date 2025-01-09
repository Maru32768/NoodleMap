import { Flex, Input, VStack } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/use-auth.ts";
import { LoadableButton } from "@/components/loadable-button.tsx";

export default function LoginPage() {
  const { login } = useAuth();

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
          colorPalette="teal"
          disabled={!form.formState.isValid}
          onClick={() => {
            const values = form.getValues();
            return login(values.email, values.password);
          }}
        >
          ログイン
        </LoadableButton>
      </VStack>
    </Flex>
  );
}
