import { Button, ButtonProps, chakra } from "@chakra-ui/react";
import { Link } from "react-router";

const ChakraLink = chakra(Link);

export function ButtonLink(props: ButtonProps & { to: string }) {
  return <Button as={ChakraLink} {...props} />;
}
