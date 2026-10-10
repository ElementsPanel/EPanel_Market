<template>
  <v-app>
    <AppHeader />

    <v-main>
      <slot />
    </v-main>

    <AuthDialog />
  </v-app>
</template>
