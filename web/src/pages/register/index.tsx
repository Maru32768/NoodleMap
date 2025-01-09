import { useForm } from "react-hook-form";
import { Flex, Input, VStack } from "@chakra-ui/react";
import { Field } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/use-auth.ts";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { useNavigate } from "react-router";
import { SEARCH_PATH } from "@/utils/path.ts";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

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
            return register(values.email, values.password).then(() => {
              navigate(SEARCH_PATH);
            });
          }}
        >
          登録
        </LoadableButton>
      </VStack>
    </Flex>
  );
}
