package main

import (
	"os"

	"github.com/newstarnion/starnion-cli/internal/cli"
)

func main() {
	root := cli.NewRootCmd()
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
