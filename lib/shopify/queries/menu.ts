export const getMenuQuery = /* GraphQL */ `
  query getMenu($handle: String!, $language: LanguageCode)
  @inContext(language: $language) {
    menu(handle: $handle) {
      items {
        title
        url
      }
    }
  }
`;
