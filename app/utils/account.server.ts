/**
 * Server utilities for Instagram account management
 * Centralized functions to avoid duplication
 */

import prisma from "../db.server";

/**
 * Get Instagram account for a shop from database
 */
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

/**
 * Update Instagram account username
 */
export async function updateAccountUsername(accountId: string, username: string) {
  return await prisma.socialAccount.update({
    where: { id: accountId },
    data: { username },
  });
}

/**
 * Delete Instagram account
 */
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
