import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Near Native Instagram</h1>
        <p className={styles.text}>
          A developer-focused app that syncs Instagram posts to Shopify
          metaobjects, giving you complete control to build custom Instagram
          feeds using Liquid templates.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Built for Developers.</strong> No pre-built UI components.
            This app syncs Instagram data to Shopify metaobjects, giving you
            complete freedom to build custom Instagram feeds with your own
            design and functionality.
          </li>
          <li>
            <strong>Native Shopify Storage.</strong> Instagram posts stored as
            metaobjects with full access via Liquid templates. Query and display
            your Instagram content using standard Shopify APIs - no external
            dependencies.
          </li>
          <li>
            <strong>Starter Liquid Templates Included.</strong> Get reference
            Liquid files as a starting point. Customize them completely or build
            your own from scratch using the metaobject data structure.
          </li>
          <li>
            <strong>Full Data Access.</strong> Every Instagram post includes:
            images, captions, likes, comments, timestamps, and permalinks - all
            accessible through Shopify's metaobject API for maximum flexibility.
          </li>
        </ul>
      </div>
    </div>
  );
}
