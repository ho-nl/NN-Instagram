import prisma from "../db.server";

export async function getInstagramAccount(shop: string) {
  return await prisma.socialAccount.findUnique({
    where: {
      shop_provider: {
        shop,
        provider: "instagram",
      },
    },
  });
}

export async function updateAccountUsername(accountId: string, username: string) {
  return await prisma.socialAccount.update({
    where: { id: accountId },
    data: { username },
  });
}

export async function deleteInstagramAccount(shop: string) {
  return await prisma.socialAccount.delete({
    where: {
      shop_provider: {
        shop,
        provider: "instagram",
      },
    },
  });
}
