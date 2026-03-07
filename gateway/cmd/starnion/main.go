// StarNion CLI — single binary for managing all StarNion services.
package main

import (
	"os"

	"github.com/jikime/starnion/gateway/internal/cli"
)

func main() {
	root := cli.NewRootCmd()
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
