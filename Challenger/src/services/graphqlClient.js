import { ApolloClient, HttpLink, InMemoryCache, split } from '@apollo/client/core'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'

const graphqlUri = (import.meta.env.VITE_GRAPHQL_URL || '/graphql').trim()
const graphqlWsUri = (import.meta.env.VITE_GRAPHQL_WS_URL || '').trim()

function toWsUri(httpUri) {
  if (!httpUri) {
    return ''
  }

  if (httpUri.startsWith('ws://') || httpUri.startsWith('wss://')) {
    return httpUri
  }

  if (httpUri.startsWith('http://')) {
    return `ws://${httpUri.slice('http://'.length)}`
  }

  if (httpUri.startsWith('https://')) {
    return `wss://${httpUri.slice('https://'.length)}`
  }

  if (httpUri.startsWith('/')) {
    if (typeof window === 'undefined') {
      return ''
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}${httpUri}`
  }

  return httpUri
}

const wsUri = toWsUri(graphqlWsUri || graphqlUri)

const httpLink = new HttpLink({
  uri: graphqlUri,
  credentials: 'include',
})

const wsLink = typeof window !== 'undefined' && wsUri
  ? new GraphQLWsLink(createClient({ url: wsUri }))
  : null

const link = wsLink
  ? split(
    ({ query }) => {
      const definition = getMainDefinition(query)
      return definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
    },
    wsLink,
    httpLink,
  )
  : httpLink

export const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache(),
})
