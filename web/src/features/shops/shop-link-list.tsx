import {
  displayableShopLinks,
  ShopLink,
  shopLinkText,
  ShopLinkType,
} from "@/features/shops/shop-links.ts";
import { Box, Link } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { FaFacebook, FaInstagram, FaTwitter } from "react-icons/fa";
import { LuGlobe, LuLink, LuUtensils } from "react-icons/lu";

const LINK_ICON: Readonly<
  Record<ShopLinkType, { icon: IconType; color?: string }>
> = {
  official: { icon: LuGlobe },
  twitter: { icon: FaTwitter, color: "#1DA1F2" },
  instagram: { icon: FaInstagram },
  facebook: { icon: FaFacebook },
  tabelog: { icon: LuUtensils },
  other: { icon: LuLink },
};

export function ShopLinkList({
  links,
}: {
  links: readonly ShopLink[] | undefined;
}) {
  const shown = displayableShopLinks(links);
  if (shown.length === 0) {
    return null;
  }

  return (
    <Box
      as="ul"
      aria-label="店舗リンク"
      listStyleType="none"
      display="flex"
      flexWrap="wrap"
      gap="0.5rem"
    >
      {shown.map((link, i) => {
        const { icon: Icon, color } = LINK_ICON[link.type] ?? LINK_ICON.other;
        return (
          <li key={i}>
            <Link
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="0.375rem"
              px="0.625rem"
              py="0.375rem"
              bg="nm.bg"
              border="1px solid"
              borderColor="nm.line"
              borderRadius="nmMd"
              fontSize="0.75rem"
              color="nm.ink"
              textDecoration="none"
              _hover={{ borderColor: "nm.ink", textDecoration: "none" }}
            >
              <Icon aria-hidden="true" size={14} color={color} />
              {shopLinkText(link)}
            </Link>
          </li>
        );
      })}
    </Box>
  );
}
